import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Baked-in credentials (anon key is public/publishable, safe to include)
const SUPABASE_URL = "https://ambobbkgpacmgyxnsmgc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7t0_wk2pijTttExgT9BjXg_gwLsNsIA";

let _supabase: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

export function getApiKey(): string {
  const key = process.env.SWIPEGPT_API_KEY;
  if (!key) {
    throw new Error(
      "Missing SWIPEGPT_API_KEY environment variable. Get your key at https://swipegpt.app/developers"
    );
  }
  return key;
}
