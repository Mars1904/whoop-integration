import { NextRequest, NextResponse } from 'next/server';
import { WHOOP_AUTH_URL, WHOOP_CLIENT_ID, WHOOP_REDIRECT_URI } from '../../lib/whoop';

export async function GET(req: NextRequest) {
  try {
    if (!WHOOP_AUTH_URL || !WHOOP_CLIENT_ID || !WHOOP_REDIRECT_URI) {
      console.error('WHOOP OAuth environment variables are missing.');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const scopes = 'offline read:recovery read:cycles read:sleep read:workout read:profile';
    const authUrlConst = WHOOP_AUTH_URL; // Ensure it's treated as a const string
    const authUrl = new URL(authUrlConst);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', WHOOP_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', WHOOP_REDIRECT_URI);
    authUrl.searchParams.append('scope', scopes);
    // Optional: CSRF-Schutz durch 'state'-Parameter implementieren
    // const state = crypto.randomUUID();
    // authUrl.searchParams.append('state', state);
    // Den 'state' in einem httpOnly Cookie speichern und im Callback verifizieren.

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('Error during WHOOP auth redirect construction:', error.message);
    // Zeige eine generische Fehlermeldung oder leite auf eine Fehlerseite um
    const errorPageUrl = new URL('/', req.nextUrl.origin);
    errorPageUrl.searchParams.set('error', 'auth_redirect_failed');
    errorPageUrl.searchParams.set('reason', error.message || 'unknown_error');
    return NextResponse.redirect(errorPageUrl);
  }
} 