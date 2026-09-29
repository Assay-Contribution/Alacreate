/*  Helpers every API endpoint uses: the handler signature, the common request checks,
    reading and validating the request body, and JSON responses. Server-only. */
import { isSignedIn } from "./supabase.server";

const MAX_ITEMS = 50;
const MAX_ITEM_LENGTH = 2000;

export type HandlerOptions = {
  // Only the local dev server turns this off, so the backend-free demo page works.
  requireAuth?: boolean;
  // Only the local dev server turns this on: logs what the model received and returned
  // to the terminal. Off in production so users' notes don't end up in server logs.
  debug?: boolean;
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
