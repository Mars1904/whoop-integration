import { supabase } from './supabase';
import { getCookie, setCookie } from 'cookies-next';
import { NextRequest, NextResponse } from 'next/server';

const WHOOP_API_BASE_URL_INTERNAL = process.env.WHOOP_API_BASE_URL || 'https://api.prod.whoop.com/v1';
const WHOOP_TOKEN_URL_INTERNAL = process.env.WHOOP_TOKEN_URL!;
const WHOOP_CLIENT_ID_INTERNAL = process.env.WHOOP_CLIENT_ID!;
const WHOOP_CLIENT_SECRET_INTERNAL = process.env.WHOOP_CLIENT_SECRET!;
const WHOOP_REDIRECT_URI_INTERNAL = process.env.WHOOP_REDIRECT_URI!;
const APP_SECRET_INTERNAL = process.env.APP_SECRET!;
const WHOOP_AUTH_URL_INTERNAL = process.env.WHOOP_AUTH_URL!;
// Optional: Webhook-Secret, falls von WHOOP unterstützt
const WHOOP_WEBHOOK_SECRET_INTERNAL = process.env.WHOOP_WEBHOOK_SECRET;

if (!WHOOP_TOKEN_URL_INTERNAL || !WHOOP_CLIENT_ID_INTERNAL || !WHOOP_CLIENT_SECRET_INTERNAL || !WHOOP_REDIRECT_URI_INTERNAL || !APP_SECRET_INTERNAL || !WHOOP_AUTH_URL_INTERNAL) {
  throw new Error('One or more WHOOP environment variables are not set. Please check your .env.local file.');
}

// Export konstanten für externe Verwendung
export const WHOOP_API_BASE_URL = WHOOP_API_BASE_URL_INTERNAL;
export const WHOOP_TOKEN_URL = WHOOP_TOKEN_URL_INTERNAL;
export const WHOOP_CLIENT_ID = WHOOP_CLIENT_ID_INTERNAL;
export const WHOOP_CLIENT_SECRET = WHOOP_CLIENT_SECRET_INTERNAL;
export const WHOOP_REDIRECT_URI = WHOOP_REDIRECT_URI_INTERNAL;
export const APP_SECRET = APP_SECRET_INTERNAL;
export const WHOOP_AUTH_URL = WHOOP_AUTH_URL_INTERNAL;
export const WHOOP_WEBHOOK_SECRET = WHOOP_WEBHOOK_SECRET_INTERNAL;

interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number; // WHOOP user ID is numeric
}

interface WhoopCycle {
  id: number;
  user_id: number;
  start: string;
  end: string | null;
  timezone_offset: string | null;
  score_state: string;
  // Strain
  strain?: {
    score: number;
  };
  // Recovery
  recovery?: {
    score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
  };
  // Sleep
  sleep?: {
    id: number;
    REM_duration_milli: number;
    SWS_duration_milli: number;
    light_duration_milli: number;
    wake_duration_milli: number;
    sleep_onset: string;
    sleep_end: string;
    total_sleep_duration_milli: number;
    sleep_needed_milli?: number;
    sleep_debt_milli?: number;
    sleep_efficiency_percent?: number;
    respiratory_rate?: number;
    sleep_consistency_percent?: number;
  };
}

interface WhoopProfile {
    user_id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
}

export interface TransformedWhoopData {
  whoop_user_id: string;
  sleep_duration: number | null;
  recovery_score: number | null;
  strain_score: number | null;
  heart_rate: number | null;
  timestamp: string; // ISO string
}

// Helper to get current user's active WHOOP access token from Supabase
async function getActiveAccessToken(whoopUserId: string): Promise<string | null> {
  if (!supabase) {
    console.error("Supabase client not initialized in getActiveAccessToken");
    return null;
  }
  const { data, error } = await supabase
    .from('whoop_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('whoop_user_id', whoopUserId)
    .single();

  if (error || !data) {
    console.error('Error fetching token or token not found:', error?.message);
    return null;
  }

  const tokenExpiresAt = new Date(data.expires_at).getTime();
  const now = new Date().getTime();

  // If token is expired or expires in the next 5 minutes, refresh it
  if (tokenExpiresAt < now - 5 * 60 * 1000) {
    console.log('Access token expired, refreshing...');
    try {
      const response = await fetch(WHOOP_TOKEN_URL_INTERNAL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: data.refresh_token,
          client_id: WHOOP_CLIENT_ID_INTERNAL,
          client_secret: WHOOP_CLIENT_SECRET_INTERNAL,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} ${errorBody}`);
      }

      const newTokens: WhoopTokenResponse = await response.json();
      const newExpiresAt = new Date(new Date().getTime() + newTokens.expires_in * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('whoop_tokens')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token, // WHOOP might return a new refresh token
          expires_at: newExpiresAt,
        })
        .eq('whoop_user_id', whoopUserId);

      if (updateError) {
        console.error('Error updating new tokens in Supabase:', updateError.message);
        return null;
      }
      console.log('Token refreshed and updated successfully.');
      return newTokens.access_token;
    } catch (refreshError: any) {
      console.error('Error refreshing token:', refreshError.message);
      // If refresh fails, the old token is likely invalid. Consider deleting or marking it.
      return null;
    }
  }

  return data.access_token;
}

// Fetch WHOOP Profile to get user_id
async function fetchWhoopProfileInternal(accessToken: string): Promise<WhoopProfile | null> {
  try {
    const response = await fetch(`${WHOOP_API_BASE_URL_INTERNAL}/user/profile/basic`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching WHOOP profile: ${response.status} ${errorText}`);
      return null;
    }
    return await response.json() as WhoopProfile;
  } catch (error: any) {
    console.error('Exception fetching WHOOP profile:', error.message);
    return null;
  }
}

// Fetch latest WHOOP cycle data (includes sleep, strain, recovery)
async function fetchLatestWhoopCycle(accessToken: string): Promise<WhoopCycle | null> {
  try {
    // Get all cycles for the last 7 days to find the most recent one with a score.
    // WHOOP API might return cycles that are still in progress or don't have scores yet.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch(`${WHOOP_API_BASE_URL_INTERNAL}/cycle?start=${sevenDaysAgo}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error fetching WHOOP cycles: ${response.status} ${errorText}`);
        return null;
    }

    const cycles: WhoopCycle[] = await response.json();
    if (!cycles || cycles.length === 0) {
        console.log('No WHOOP cycles found for the user in the last 7 days.');
        return null;
    }

    // Find the most recent cycle that is completed and has a score
    const completedCycles = cycles
        .filter(c => c.score_state === 'SCORED' && c.end !== null)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    return completedCycles.length > 0 ? completedCycles[0] : null;

  } catch (error: any) {
    console.error('Exception fetching WHOOP cycle:', error.message);
    return null;
  }
}

// Function to transform WHOOP data into the structure for Supabase
function transformWhoopDataForSupabase(
  cycle: WhoopCycle,
  whoopUserId: string
): TransformedWhoopData | null {
  if (!cycle || cycle.score_state !== 'SCORED') {
    return null;
  }

  // WHOOP API provides sleep duration in milliseconds, convert to hours
  const sleepDurationHours = cycle.sleep?.total_sleep_duration_milli
    ? cycle.sleep.total_sleep_duration_milli / (1000 * 60 * 60)
    : null;

  return {
    whoop_user_id: whoopUserId,
    sleep_duration: sleepDurationHours,
    recovery_score: cycle.recovery?.score ?? null,
    strain_score: cycle.strain?.score ?? null,
    heart_rate: cycle.recovery?.resting_heart_rate ?? null,
    timestamp: cycle.end || cycle.start, // Use cycle end time, fallback to start if not available
  };
}

// Main function to fetch and store WHOOP data
export async function fetchAndStoreWhoopData(whoopUserId: string): Promise<boolean> {
  if (!supabase) {
    console.error("Supabase client not initialized in fetchAndStoreWhoopData");
    return false;
  }
  const accessToken = await getActiveAccessToken(whoopUserId);
  if (!accessToken) {
    console.error('Could not obtain active access token for user:', whoopUserId);
    return false;
  }

  const latestCycle = await fetchLatestWhoopCycle(accessToken);
  if (!latestCycle) {
    console.log('No new scorable WHOOP cycle data found for user:', whoopUserId);
    return false;
  }

  const transformedData = transformWhoopDataForSupabase(latestCycle, whoopUserId);
  if (!transformedData) {
    console.log('Could not transform WHOOP data for user:', whoopUserId);
    return false;
  }

  try {
    // Check if data for this timestamp (cycle end) already exists
    const { data: existingData, error: checkError } = await supabase
      .from('whoop_data')
      .select('id')
      .eq('whoop_user_id', transformedData.whoop_user_id)
      .eq('timestamp', transformedData.timestamp)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking for existing WHOOP data:', checkError.message);
      // Proceed to insert, as we can't confirm existence.
      // Or handle more gracefully depending on requirements.
    }

    if (existingData) {
      console.log('WHOOP data for this cycle already exists in Supabase. Skipping insert.', {
        whoop_user_id: transformedData.whoop_user_id,
        timestamp: transformedData.timestamp,
      });
      return true; // Data already exists, count as success
    }

    const { error: insertError } = await supabase
      .from('whoop_data')
      .insert(transformedData);

    if (insertError) {
      console.error('Error saving WHOOP data to Supabase:', insertError.message);
      return false;
    }

    console.log('Successfully fetched and stored WHOOP data for user:', whoopUserId);
    return true;
  } catch (error: any) {
    console.error('Exception storing WHOOP data:', error.message);
    return false;
  }
}

// Helper to get user ID from cookie (used on server-side pages/components)
export async function getWhoopUserIdFromCookie(req: NextRequest): Promise<string | null> {
    const whoopUserCookie = getCookie('whoop_user_id', { req });
    if (typeof whoopUserCookie === 'string') {
        return whoopUserCookie;
    }
    return null;
}

// Helper to store user ID in cookie (used after successful login)
// Note: Using httpOnly is not possible with getCookie/setCookie from 'cookies-next' in App Router Server Components directly
// For true httpOnly cookies, you would set them in API route responses.
export function setWhoopUserCookie(res: NextResponse, userId: string) {
    // Cookies set in API Route handlers (res) are HttpOnly by default if not read by client JS
    // For pages, if you need to read it client-side, it cannot be HttpOnly.
    // Here, we assume it might be needed by server components or API routes.
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    setCookie('whoop_user_id', userId, { res, maxAge: oneYear, path: '/', sameSite: 'lax'});
}

export const fetchWhoopProfile = fetchWhoopProfileInternal; 