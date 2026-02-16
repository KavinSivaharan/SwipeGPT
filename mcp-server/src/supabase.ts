import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || "";
}

export function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || "";
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Convenience aliases
export { getSupabaseUrl as SUPABASE_URL_FN, getSupabaseAnonKey as SUPABASE_ANON_KEY_FN };
