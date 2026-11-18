# WHOOP Integration App

Eine Next.js-Webanwendung zur Integration mit der WHOOP API, um Gesundheits- und Fitnessdaten zu verfolgen.

## Funktionen

- WHOOP OAuth 2.0 Login
- Datenabruf und -speicherung in Supabase
- Webhook-Integration für automatische Datenaktualisierungen
- Visualisierung von Schlaf-, Erholungs- und Belastungsdaten

## Technologien

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Datenbank und Authentifizierung)
- **WHOOP API** (via OAuth2)

## Einrichtung

### Voraussetzungen

- Node.js und npm/yarn
- WHOOP Developer Account mit OAuth-Anwendung
- Supabase-Konto und -Projekt

### Umgebungsvariablen

Erstelle eine `.env.local` Datei im Stammverzeichnis mit den folgenden Variablen:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=deine-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=dein-supabase-anon-key

# WHOOP OAuth
WHOOP_CLIENT_ID=dein-whoop-client-id
WHOOP_CLIENT_SECRET=dein-whoop-client-secret
WHOOP_REDIRECT_URI=https://deine-domain.com/api/auth/callback

# App Secret (für Cookie-Verschlüsselung)
APP_SECRET=dein-app-secret

# WHOOP API Endpoints
WHOOP_AUTH_URL=https://api.prod.whoop.com/oauth/oauth2/auth
WHOOP_TOKEN_URL=https://api.prod.whoop.com/oauth/oauth2/token
WHOOP_API_BASE_URL=https://api.prod.whoop.com/v1

# Optional: Webhook Secret (falls von WHOOP unterstützt)
WHOOP_WEBHOOK_SECRET=dein-webhook-secret
```

### Supabase-Einrichtung

Führe die folgenden SQL-Befehle in deinem Supabase SQL-Editor aus, um die notwendigen Tabellen zu erstellen:

```sql
-- Tabelle für WHOOP API Tokens
CREATE TABLE public.whoop_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    whoop_user_id TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Automatisches Update des updated_at Feldes
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_whoop_tokens
BEFORE UPDATE ON public.whoop_tokens
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Tabelle für WHOOP Performance-Daten
CREATE TABLE public.whoop_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    whoop_user_id TEXT NOT NULL,
    sleep_duration FLOAT,
    recovery_score INTEGER,
    strain_score FLOAT,
    heart_rate INTEGER,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index für schnellere Abfragen
CREATE INDEX idx_whoop_data_user_id_timestamp ON public.whoop_data(whoop_user_id, timestamp DESC);
```

### Installation und Start

```bash
# Abhängigkeiten installieren
npm install
# oder
yarn install

# Entwicklungsserver starten
npm run dev
# oder
yarn dev
```

Die Anwendung ist dann unter http://localhost:3000 verfügbar.

## WHOOP Webhook-Integration

Die App verwendet einen Webhook-Endpunkt, um automatisch WHOOP-Daten zu aktualisieren:

1. Registriere einen Webhook in deinem WHOOP Developer Portal mit der URL: `https://deine-domain.com/api/whoop-webhook`
2. Wähle die relevanten Event-Typen aus, für die du benachrichtigt werden möchtest
3. Falls WHOOP ein Webhook-Secret unterstützt, konfiguriere es und füge es als `WHOOP_WEBHOOK_SECRET` zu deinen Umgebungsvariablen hinzu

## Deployment auf Vercel

1. Pushe deinen Code zu GitHub
2. Importiere das Repository in Vercel
3. Setze die Umgebungsvariablen in den Projekteinstellungen
4. Stelle sicher, dass der `WHOOP_REDIRECT_URI` auf deine Vercel-Domain zeigt

## Lizenz

MIT 