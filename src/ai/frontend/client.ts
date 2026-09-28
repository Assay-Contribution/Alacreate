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

// Like postAi, but for endpoints that stream plain text back (the assistant). Calls onText
// with the text so far each time more arrives. Resolves to the full text, or null if the
// response was empty (e.g. the AI chose to stay silent) or failed before any text arrived.
export async function streamAi(
  path: string,
  body: unknown,
  onText?: (textSoFar: string) => void,
): Promise<string | null> {
  let text = "";
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      console.warn(`[ai] ${path} error`, response.status, await response.text());
      return null;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text) onText?.(text);
    }
  } catch (error) {
    console.warn(`[ai] ${path} request failed`, error);
  }
  return text || null;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
