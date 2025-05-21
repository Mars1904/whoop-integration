import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreWhoopData } from '../../lib/whoop';
import { supabase } from '../../lib/supabase';

// Optional: Webhook-Secret für zusätzliche Sicherheit, falls vorhanden
const WEBHOOK_SECRET = process.env.WHOOP_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Optional: Authentifiziere den Webhook, falls WHOOP eine Signaturvalidierung unterstützt
    // const signature = request.headers.get('x-whoop-signature');
    // if (WEBHOOK_SECRET && !verifyWebhookSignature(await request.clone().text(), signature || '')) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }
    
    const body = await request.json();
    
    // WHOOP Webhook-Format auswerten (passe dies entsprechend der tatsächlichen WHOOP-Webhook-Daten an)
    const whoopUserId = body.user_id || body.userId || (body.data && body.data.user_id);
    const eventType = body.event_type || body.type;
    
    console.log(`WHOOP Webhook empfangen: Event ${eventType} für Benutzer ${whoopUserId}`);
    
    if (!whoopUserId) {
      console.error('Fehlende Benutzer-ID im Webhook-Payload:', body);
      return NextResponse.json({ error: 'Benutzer-ID fehlt im Webhook-Payload' }, { status: 400 });
    }
    
    // Daten für den betroffenen Benutzer abrufen und aktualisieren
    const success = await fetchAndStoreWhoopData(whoopUserId);
    
    console.log(`Daten-Update für Benutzer ${whoopUserId} ${success ? 'erfolgreich' : 'fehlgeschlagen'}`);
    
    // WHOOP erwartet eine 200-Antwort für erfolgreiche Webhook-Verarbeitung
    return NextResponse.json({ 
      success, 
      message: success ? 'Daten erfolgreich aktualisiert' : 'Keine neuen Daten gefunden oder Fehler aufgetreten',
      user_id: whoopUserId,
      event_type: eventType,
      processed_at: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Fehler bei der Verarbeitung des WHOOP Webhooks:', error);
    return NextResponse.json({ 
      error: 'Webhook-Verarbeitung fehlgeschlagen', 
      message: error.message 
    }, { status: 500 });
  }
}

// Optional: Falls WHOOP eine Signaturvalidierung unterstützt
// function verifyWebhookSignature(payload: string, signature: string): boolean {
//   const crypto = require('crypto');
//   const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
//   return hmac === signature;
// } 