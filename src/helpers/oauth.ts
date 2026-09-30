/*  OAuth helpers shared by the app configs in integrations/ (one file per app). They
    only ever run on the server (src/ai/endpoints/integrations.server.ts and
    src/ai/lib/connections.server.ts) and read secrets from process.env at call time, so
    nothing secret is in the browser bundle even though the Integrations page imports the
    app configs for their names.
*/
import type { TokenSet } from "../types/integrations.js";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Posts the form most providers use to trade a one-time code (or a refresh token) for tokens.
export async function exchangeCode(
  tokenUrl: string,
  form: Record<string, string>,
): Promise<TokenSet> {
  const response = await fetch(tokenUrl, { method: "POST", body: new URLSearchParams(form) });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  // Slack answers 200 with { ok: false } on failure.
  if (!response.ok || !data || data.ok === false || typeof data.access_token !== "string") {
    const reason = data?.error_description ?? data?.error ?? `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${String(reason)}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
    scopes: typeof data.scope === "string" ? data.scope : null,
  };
}

// Google tokens last an hour; this gets a new one. Shared by Google Drive and Gmail.
export function refreshGoogleToken(refreshToken: string): Promise<TokenSet> {
  return exchangeCode("https://oauth2.googleapis.com/token", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
  });
}

export async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}
