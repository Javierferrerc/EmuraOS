/**
 * Supabase client for the social layer. Lives in the renderer because that's
 * where the UI + Realtime/Presence run. The anon key is public by design;
 * authorization is enforced server-side by RLS (see supabase/migrations).
 *
 * Configured via Vite env (`.env`): VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 * When unset, the social layer is simply "not configured" and the UI shows the
 * deferred / sign-in-required state instead of crashing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** True once the build has Supabase credentials. */
export function isSocialConfigured(): boolean {
  return Boolean(URL && ANON);
}

/** Lazily create (and reuse) the Supabase client, or null if unconfigured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSocialConfigured()) return null;
  if (!client) {
    client = createClient(URL as string, ANON as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // desktop: we handle the OAuth redirect ourselves
      },
    });
  }
  return client;
}
