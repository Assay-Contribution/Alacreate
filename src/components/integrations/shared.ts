/*  Types and helpers shared by the integration files in this folder (one file per app).
    Each integration holds what the Integrations page shows (name, description) and how to
    run its OAuth sign-in. The OAuth functions only ever run on the server
    (src/ai/endpoints/integrations.server.ts); they read secrets from process.env at call time, so
    nothing secret is in these files even though the page imports them for the names.
*/

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scopes: string | null;
};

export type Integration = {
  // The id in URLs (/auth/<provider>/callback) and in the integration_connections table.
  provider: string;
  // Share another integration's redirect URI (/auth/<callbackProvider>/callback), e.g. Gmail
  // reuses Google's so no new URI has to be registered. Defaults to provider.
  callbackProvider?: string;
  name: string;
  description: string;
  clientIdEnv: string;
  authorizeUrl: (clientId: string, redirectUri: string, state: string) => string;
  // Trades the callback's one-time code for tokens (GroupMe sends the token directly).
  exchange: (url: URL, redirectUri: string) => Promise<TokenSet>;
  // Trades a saved refresh token for a new access token, for apps whose tokens expire.
  refresh?: (refreshToken: string) => Promise<TokenSet>;
  // A human-readable name for the connected account (an email, workspace, or user name).
  accountLabel: (tokens: TokenSet) => Promise<string | null>;
  // GroupMe has no state parameter, so its callback can only be checked against the cookie.
  usesState: boolean;
};

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
