import { NextRequest, NextResponse } from 'next/server';
import { WHOOP_AUTH_URL, WHOOP_CLIENT_ID, WHOOP_REDIRECT_URI } from '@/lib/whoop';

export async function GET(req: NextRequest) {
  try {
    if (!WHOOP_AUTH_URL || !WHOOP_CLIENT_ID || !WHOOP_REDIRECT_URI) {
      console.error('WHOOP OAuth environment variables are missing.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const scopes = 'offline read:recovery read:cycles read:sleep read:workout read:profile';
    const authUrl = new URL(WHOOP_AUTH_URL);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', WHOOP_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', WHOOP_REDIRECT_URI);
    authUrl.searchParams.append('scope', scopes);
    // You can also add a 'state' parameter here for CSRF protection if desired
    // const state = crypto.randomUUID(); // Generate a random state
    // authUrl.searchParams.append('state', state);
    // store the state in a cookie or session to verify it on callback

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('Error during WHOOP auth redirect:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 