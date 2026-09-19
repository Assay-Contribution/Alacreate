import { createClient } from "@supabase/supabase-js";

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;

    if (url.pathname === "/auth/v1" || url.pathname === "/auth/v1/") {
      url.pathname = "/";
    }

    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
