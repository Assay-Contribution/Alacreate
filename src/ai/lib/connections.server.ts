/*  The signed-in user's connected apps (rows in integration_connections, saved by
    endpoints/integrations.server.ts), and working access tokens for the AI's tools.
    Tokens are read with the admin client because the table has no RLS policies: only the
    server may see them. Always pass a user id that came from a verified login. Server-only. */
import { findIntegration } from "../../components/integrations";
import { createAdminClient } from "./supabase.server";

// Refresh a little early so a token doesn't expire in the middle of a tool call.
const EXPIRY_MARGIN_MS = 60 * 1000;

export type Connection = {
  provider: string;
  accountLabel: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  // Usable right now: the token hasn't expired, or it has but can be refreshed. The AI only
  // gets tools for working connections; the others need reconnecting.
  working: boolean;
};

// All of the user's connections, each marked working or not.
export async function loadConnections(userId: string): Promise<Connection[]> {
  const { data, error } = await createAdminClient()
    .from("integration_connections")
    .select("provider, account_label, access_token, refresh_token, expires_at")
    .eq("user_id", userId);
  if (error) {
    console.error("[connections] couldn't load connections", error.message);
    return [];
  }
  return data
    .map((row) => ({
      provider: row.provider as string,
      accountLabel: row.account_label as string | null,
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string | null,
      expiresAt: row.expires_at as string | null,
      working: false,
    }))
    .map((connection) => ({ ...connection, working: !isExpired(connection) || canRefresh(connection) }));
}

export type TokenResult = { token: string } | { error: string };

// A usable access token for one of the user's apps, refreshed and saved first if it has
// expired. The error is written for the AI to pass on to the user.
export async function getAccessToken(userId: string, provider: string): Promise<TokenResult> {
  const integration = findIntegration(provider);
  const name = integration?.name ?? provider;
  const { data: row, error } = await createAdminClient()
    .from("integration_connections")
    .select("provider, account_label, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) return { error: `Couldn't load the ${name} connection: ${error.message}` };
  if (!row) return { error: `${name} isn't connected. The user can connect it on the Integrations page.` };

  const connection: Connection = {
    provider,
    accountLabel: row.account_label,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    working: true,
  };
  if (!isExpired(connection)) return { token: connection.accessToken };
  if (!integration?.refresh || !connection.refreshToken) {
    return { error: `The ${name} connection has expired. The user needs to reconnect it on the Integrations page.` };
  }

  try {
    const tokens = await integration.refresh(connection.refreshToken);
    const { error: saveError } = await createAdminClient()
      .from("integration_connections")
      .update({
        access_token: tokens.accessToken,
        // Google doesn't send a new refresh token on refresh; keep the one we have.
        refresh_token: tokens.refreshToken ?? connection.refreshToken,
        expires_at: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
          : null,
      })
      .eq("user_id", userId)
      .eq("provider", provider);
    if (saveError) console.error(`[connections] couldn't save refreshed ${provider} token`, saveError.message);
    return { token: tokens.accessToken };
  } catch (refreshError) {
    console.error(`[connections] ${provider} token refresh failed`, refreshError);
    return {
      error: `The ${name} connection stopped working (access may have been revoked). The user needs to reconnect it on the Integrations page.`,
    };
  }
}

function isExpired(connection: Pick<Connection, "expiresAt">): boolean {
  if (!connection.expiresAt) return false;
  return new Date(connection.expiresAt).getTime() - EXPIRY_MARGIN_MS <= Date.now();
}

function canRefresh(connection: Pick<Connection, "provider" | "refreshToken">): boolean {
  return Boolean(connection.refreshToken && findIntegration(connection.provider)?.refresh);
}
