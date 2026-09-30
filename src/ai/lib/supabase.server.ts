/*  Supabase clients for server code: one that acts as the signed-in user (so Row Level
    Security applies) and an admin one with the service-role key (bypasses RLS; never use
    it in src/ai/mcp/ tools). Server-only. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A Supabase client that acts as the user who sent the request, so Row Level Security
// limits every query to their own data. Null if the request has no login token.
export function createUserClient(request: Request): SupabaseClient | null {
  const token = bearerToken(request);
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// The login token the browser sent, if any.
export function bearerToken(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? null;
}

// The signed-in user's id, verified with Supabase. Null if there's no valid login token.
export async function signedInUserId(request: Request): Promise<string | null> {
  const token = bearerToken(request);
  const userDb = createUserClient(request);
  if (!token || !userDb) return null;
  const { data } = await userDb.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function isSignedIn(request: Request): Promise<boolean> {
  const token = bearerToken(request);
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return false;

  try {
    const response = await fetch(`${new URL(supabaseUrl).origin}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Acts as the server itself, bypassing Row Level Security. Only for background work that
// has already checked who the user is (file processing, message indexing, OAuth tokens).
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
