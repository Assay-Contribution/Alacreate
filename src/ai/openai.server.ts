/*  Shared helpers for the AI backend. Files ending in .server.ts run only on the server
    (Vercel functions and the Vite dev middleware); never import them from browser code.
    The OpenAI key (API_KEY) only lives on the server, never in the browser bundle. */

export const MODEL = "gpt-4.1-mini";
const MAX_ITEMS = 50;
const MAX_ITEM_LENGTH = 2000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type HandlerOptions = {
  // Only the local dev server turns this off, so the backend-free demo page works.
  requireAuth?: boolean;
};

export type Handler = (request: Request, options?: HandlerOptions) => Promise<Response>;

// Runs the checks every AI endpoint needs before calling OpenAI.
export async function guardRequest(
  request: Request,
  { requireAuth = true }: HandlerOptions,
): Promise<Response | null> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);
  if (requireAuth && !(await isSignedIn(request))) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export async function chat(messages: ChatMessage[], maxTokens: number): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });

  if (!response.ok) {
    console.error("[ai] OpenAI API error", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

async function isSignedIn(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
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

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function stringList(body: unknown, field: string): string[] | null {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  if (!value.every((item) => typeof item === "string" && item.length <= MAX_ITEM_LENGTH)) {
    return null;
  }
  return value;
}

export function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ITEM_LENGTH;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
