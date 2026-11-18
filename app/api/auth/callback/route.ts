import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import {
  WHOOP_TOKEN_URL,
  WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET,
  WHOOP_REDIRECT_URI,
  fetchWhoopProfile,
  fetchAndStoreWhoopData,
  setWhoopUserCookie
} from '../../../lib/whoop';

interface WhoopTokenApiResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: number; }; // WHOOP API liefert das User-Objekt mit ID hier
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // const stateReceived = url.searchParams.get('state'); // Wenn du state für CSRF verwendest

  // Hier den 'state' aus dem Cookie laden und mit stateReceived vergleichen, dann Cookie löschen.

  if (!code) {
    console.error('No authorization code received from WHOOP.');
    return NextResponse.redirect(new URL('/?error=auth_failed&reason=no_code', req.nextUrl.origin));
  }

  if (!supabase) {
    console.error("Supabase client not initialized in OAuth callback.");
    return NextResponse.redirect(new URL('/?error=server_config&reason=supabase_init', req.nextUrl.origin));
  }

  if (!WHOOP_TOKEN_URL || !WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_REDIRECT_URI) {
    console.error('WHOOP OAuth token exchange environment variables are missing in callback.');
    return NextResponse.redirect(new URL('/?error=server_config&reason=whoop_env_missing', req.nextUrl.origin));
  }

  try {
    const tokenResponse = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        redirect_uri: WHOOP_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(`Error fetching WHOOP tokens: ${tokenResponse.status} ${tokenResponse.statusText}`, errorBody);
      return NextResponse.redirect(new URL(`/?error=token_exchange_failed&reason=${tokenResponse.status}`, req.nextUrl.origin));
    }

    const tokens: WhoopTokenApiResponse = await tokenResponse.json();
    
    // WHOOP user ID sollte direkt in der Token-Antwort sein
    const whoopUserIdNum = tokens.user?.id;
    
    if (!whoopUserIdNum) {
        // Fallback: Versuche, das Profil abzurufen, falls die ID nicht im Token war (sollte aber)
        const profile = await fetchWhoopProfile(tokens.access_token);
        if (!profile || !profile.user_id) {
            console.error('Could not retrieve WHOOP User ID from token response or profile call.');
            return NextResponse.redirect(new URL('/?error=user_id_missing', req.nextUrl.origin));
        }
        // Hier können wir profile.user_id verwenden, wenn wir in den if-Block kommen
    }
    
    const whoopUserIdStr = String(whoopUserIdNum);
    const expires_at_timestamp = new Date(new Date().getTime() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from('whoop_tokens')
      .upsert(
        {
          whoop_user_id: whoopUserIdStr,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expires_at_timestamp,
        },
        { onConflict: 'whoop_user_id' } // Stellt sicher, dass pro User nur ein Token-Set existiert
      );

    if (upsertError) {
      console.error('Error saving WHOOP tokens to Supabase:', upsertError.message);
      return NextResponse.redirect(new URL('/?error=db_token_save_failed', req.nextUrl.origin));
    }
    console.log('WHOOP tokens successfully saved for user:', whoopUserIdStr);

    // Erfolgreich, erstelle eine Antwort (Redirect) und setze das Cookie
    const response = NextResponse.redirect(new URL('/profile', req.nextUrl.origin));
    setWhoopUserCookie(response, whoopUserIdStr); // Setzt httpOnly Cookie

    // Optional: Erste Daten direkt nach Login abrufen
    await fetchAndStoreWhoopData(whoopUserIdStr);

    return response;

  } catch (error: any) {
    console.error('Critical OAuth callback processing error:', error.message, error.stack);
    const redirectUrl = new URL('/?error=oauth_callback_exception', req.nextUrl.origin);
    if (error.message) redirectUrl.searchParams.set('reason', error.message.substring(0,100)); // Kurze Fehlermeldung
    return NextResponse.redirect(redirectUrl);
  }
} 