import { supabaseClient } from "../../supabase";

// Calls one of our /api AI endpoints with the signed-in user's token. The AI key itself
// lives server-side; the browser never talks to the AI provider directly.
export async function postAi<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    if (response.ok) return (await response.json()) as T;
    console.warn(`[ai] ${path} error`, response.status, await response.text());
  } catch (error) {
    console.warn(`[ai] ${path} request failed`, error);
  }
  return null;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
