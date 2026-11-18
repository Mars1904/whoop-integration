import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Ensure process and process.env are defined. This is typically true in Node.js and Next.js server environments.
const env = typeof process !== 'undefined' && process.env ? process.env : {};

const supabaseUrl: string | undefined = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey: string | undefined = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | undefined;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
} else {
  console.warn(
    'Supabase URL or Anon Key is missing. Supabase client will not be initialized. Check your .env.local file.'
  );
}

export const supabase = supabaseInstance; 