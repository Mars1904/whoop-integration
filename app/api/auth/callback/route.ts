import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  WHOOP_TOKEN_URL,
  WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET,
  WHOOP_REDIRECT_URI,
  fetchWhoopProfile,
  fetchAndStoreWhoopData,
  setWhoopUserCookie
} from '@/lib/whoop';

interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: number }; // WHOOP API returns user object with id
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // const state = url.searchParams.get('state'); // If you implemented state for CSRF, verify it here

  if (!code) {
    console.error('No code received from WHOOP.');
    return NextResponse.redirect(new URL('/?error=auth_failed', req.nextUrl.origin));
  }

  if (!supabase) {
    console.error("Supabase client not initialized in callback");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!WHOOP_TOKEN_URL || !WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_REDIRECT_URI) {
    console.error('WHOOP OAuth token exchange environment variables are missing.');
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        redirect_uri: WHOOP_REDIRECT_URI, // Must match the one used in the auth request
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(`Error fetching WHOOP tokens: ${tokenResponse.status}`, errorBody);
      throw new Error(`Failed to fetch WHOOP tokens: ${errorBody}`);
    }

    const tokens: WhoopTokenResponse = await tokenResponse.json();

    // Get WHOOP User ID from their API directly, as it's more reliable than just the token response.
    // The token response should contain tokens.user.id
    const whoopUserIdFromToken = tokens.user?.id;
    let whoopApiUserId: number | undefined = whoopUserIdFromToken;

    // As a fallback or primary method, fetch profile if user_id is not directly in token response (depends on WHOOP API version)
    if (!whoopApiUserId) {
        const profile = await fetchWhoopProfile(tokens.access_token);
        if (profile && profile.user_id) {
            whoopApiUserId = profile.user_id;
        } else {
            console.error('Could not retrieve WHOOP User ID from token or profile.');
            throw new Error('Failed to retrieve WHOOP User ID.');
        }
    }
    
    if (!whoopApiUserId) {
        console.error('Critical: WHOOP User ID could not be determined.');
        throw new Error('Failed to determine WHOOP User ID after token exchange.');
    }

    const whoopUserIdStr = String(whoopApiUserId);
    const expires_at = new Date(new Date().getTime() + tokens.expires_in * 1000).toISOString();

    // Store tokens in Supabase
    // Upsert logic: if user_id exists, update tokens, otherwise insert new record
    const { error: upsertError } = await supabase
      .from('whoop_tokens')
      .upsert(
        {
          whoop_user_id: whoopUserIdStr, // Ensure this is the correct WHOOP user ID
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expires_at,
        },
        { onConflict: 'whoop_user_id' } // Assumes whoop_user_id is a unique column
      );

    if (upsertError) {
      console.error('Error saving WHOOP tokens to Supabase:', upsertError.message);
      throw new Error(`Failed to save tokens: ${upsertError.message}`);
    }

    console.log('WHOOP tokens successfully saved for user:', whoopUserIdStr);

    // Set a cookie to identify the logged-in user (server-side)
    const response = NextResponse.redirect(new URL('/profile', req.nextUrl.origin));
    setWhoopUserCookie(response, whoopUserIdStr); // Use the helper from lib/whoop.ts

    // After successful login and token storage, immediately fetch initial data
    await fetchAndStoreWhoopData(whoopUserIdStr);

    return response;

  } catch (error: any) {
    console.error('OAuth callback error:', error.message, error.stack);
    // Redirect to an error page or home with an error query param
    const redirectUrl = new URL('/', req.nextUrl.origin);
    redirectUrl.searchParams.set('error', 'oauth_callback_failed');
    if (error.message.includes('Failed to fetch WHOOP tokens')) {
        redirectUrl.searchParams.set('reason', 'token_exchange_error');
    }
    return NextResponse.redirect(redirectUrl);
  }
} 