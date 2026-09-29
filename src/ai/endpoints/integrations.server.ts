/*  OAuth for the apps the AI can connect to. Each app's details (sign-in URL, token exchange)
    live in its own file in src/helpers/integrations/; this file runs the flow. Replaces the
    session-based flow in oauth_test/app.js with one that works on Vercel's stateless functions:
      1. POST /api/integrations { provider }: the signed-in user starts a connection. We set a
         short-lived signed cookie saying who they are and return the provider's sign-in URL.
      2. GET /auth/<provider>/callback: the provider sends the user back here (the same
         redirect URIs oauth_test used, so the ones registered with each provider still work). We check
         the cookie, trade the code for tokens, and save them in integration_connections.
    Tokens are only ever read and written with the service-role key; the browser never sees them.
    Served by api/integrations.ts and api/oauth/callback/[provider].ts on Vercel (vercel.json
    rewrites /auth/<provider>/callback to the latter), and by the Vite dev middleware locally. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { json, readJson } from "../lib/http.server";
import { createAdminClient, signedInUserId } from "../lib/supabase.server";
import { findIntegration, type Integration } from "../../helpers/integrations";

const STATE_COOKIE = "oauth_state";
const STATE_TTL_SECONDS = 10 * 60;
// The state cookie is only sent to the callback URLs, which all live under /auth.
const COOKIE_PATH = "/auth";
const INTEGRATIONS_PAGE = "/integrations.html";

// /api/integrations
//   GET: the signed-in user's connections (provider, account, when) — never the tokens.
//   POST { provider }: start connecting; returns { url } to send the browser to.
//   DELETE { provider }: forget that connection.
export async function handleIntegrations(request: Request): Promise<Response> {
  const userId = await signedInUserId(request);
  if (!userId) return json({ error: "Unauthorized: sign in first" }, 401);

  if (request.method === "GET") {
    const { data, error } = await createAdminClient()
      .from("integration_connections")
      .select("provider, account_label, updated_at")
      .eq("user_id", userId);
    if (error) return json({ error: `Couldn't load connections: ${error.message}` }, 500);
    return json({ connections: data });
  }

  const body = (await readJson(request)) as { provider?: unknown } | null;
  const integration = findIntegration(body?.provider);
  if (!integration) return json({ error: `Unknown provider: ${String(body?.provider)}` }, 400);
  const provider = integration.provider;

  if (request.method === "DELETE") {
    const { error } = await createAdminClient()
      .from("integration_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    if (error) return json({ error: `Couldn't disconnect: ${error.message}` }, 500);
    return json({ ok: true });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const clientId = process.env[integration.clientIdEnv];
  if (!clientId) return json({ error: `${integration.clientIdEnv} is not set on the server` }, 500);
  if (!process.env.OAUTH_STATE_SECRET) {
    return json({ error: "OAUTH_STATE_SECRET is not set on the server" }, 500);
  }

  const nonce = randomBytes(16).toString("hex");
  const cookie = signState({
    userId,
    provider,
    nonce,
    expiresAt: Date.now() + STATE_TTL_SECONDS * 1000,
  });
  const url = integration.authorizeUrl(clientId, redirectUri(request, integration), nonce);
  return new Response(JSON.stringify({ url }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": stateCookie(request, cookie, STATE_TTL_SECONDS),
    },
  });
}

// GET /auth/<provider>/callback: where each provider sends the user after they approve.
// Error redirects carry the actual reason, which the page logs and shows in an alert.
export async function handleOAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Also accepts the rewritten /api/oauth/callback/<provider>, in case Vercel passes that on.
  const match = url.pathname.match(/^\/(?:auth\/([^/]+)\/callback|api\/oauth\/callback\/([^/]+))\/?$/);
  const callbackId = match?.[1] ?? match?.[2];

  // Which app is signing in comes from the cookie, since some share a callback (Gmail uses
  // Google's). The callback path just has to be the one that app's sign-in was sent to.
  const state = verifyState(readCookie(request, STATE_COOKIE));
  if (!state) {
    return backToPage(request, {
      error: "Sign-in state cookie is missing, expired, or invalid. Please try again.",
    });
  }
  const integration = findIntegration(state.provider);
  if (!integration || callbackPath(integration) !== callbackId) {
    return backToPage(request, {
      error: `Callback /auth/${callbackId}/callback doesn't match the sign-in that was started (${state.provider}).`,
    });
  }
  if (integration.usesState && url.searchParams.get("state") !== state.nonce) {
    return backToPage(request, { error: "Sign-in state doesn't match. Please try again." });
  }
  const providerError = url.searchParams.get("error");
  if (providerError) {
    const detail = url.searchParams.get("error_description") ?? providerError;
    return backToPage(request, { error: `${integration.name} sign-in failed: ${detail}` });
  }

  try {
    const tokens = await integration.exchange(url, redirectUri(request, integration));
    const accountLabel = await integration.accountLabel(tokens).catch(() => null);
    const { error } = await createAdminClient()
      .from("integration_connections")
      .upsert(
        {
          user_id: state.userId,
          provider: integration.provider,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
            : null,
          scopes: tokens.scopes,
          account_label: accountLabel,
        },
        { onConflict: "user_id,provider" },
      );
    if (error) throw new Error(`Saving the connection failed: ${error.message}`);
    return backToPage(request, { connected: integration.provider });
  } catch (error) {
    console.error(`[integrations] ${integration.provider} callback failed`, error);
    const reason = error instanceof Error ? error.message : String(error);
    return backToPage(request, { error: `Couldn't connect ${integration.name}: ${reason}` });
  }
}

// The exact URL registered with each provider, e.g. http://localhost:3000/auth/google/callback.
// APP_URL pins the origin (e.g. so Vercel preview deployments still use the production
// callback); otherwise it's this request's own origin.
function redirectUri(request: Request, integration: Integration): string {
  // `||`, not `??`: an empty APP_URL= in .env must fall back too.
  const origin = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${origin}/auth/${callbackPath(integration)}/callback`;
}

function callbackPath(integration: Integration): string {
  return integration.callbackProvider ?? integration.provider;
}

function backToPage(request: Request, params: Record<string, string>): Response {
  const location = `${new URL(request.url).origin}${INTEGRATIONS_PAGE}?${new URLSearchParams(params)}`;
  return new Response(null, {
    status: 302,
    // The state cookie is single-use: clear it whether the connection worked or not.
    headers: { location, "set-cookie": stateCookie(request, "", 0) },
  });
}

// --- Signed state cookie ---------------------------------------------------------------
// Ties the provider's callback to the user who clicked Connect, in this browser, recently.

type OAuthState = { userId: string; provider: string; nonce: string; expiresAt: number };

function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

function verifyState(cookie: string | null): OAuthState | null {
  if (!cookie || !process.env.OAUTH_STATE_SECRET) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(hmac(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
    return state.expiresAt > Date.now() ? state : null;
  } catch {
    return null;
  }
}

function hmac(payload: string): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function stateCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // Lax still sends the cookie on the provider's top-level redirect back to us.
  return `${STATE_COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
