/*  Email (Gmail): read-only access to the user's Gmail messages.
    Uses the same Google OAuth client as Google Drive (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
    and the same redirect URI, <origin>/auth/google/callback, so nothing new to register there.
    In Google Cloud Console, enable the Gmail API and add the gmail.readonly scope to the OAuth
    consent screen. Google treats that scope as restricted: while the app is in Testing mode,
    only listed test users can connect, and publishing it needs Google's security review.
*/
import { env, exchangeCode, getJson, refreshGoogleToken, type Integration } from "./shared";

export const email: Integration = {
  provider: "gmail",
  callbackProvider: "google",
  name: "Email (Gmail)",
  description: "Read-only access to your Gmail messages.",
  clientIdEnv: "GOOGLE_CLIENT_ID",
  authorizeUrl: (clientId, redirectUri, state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
      // Offline + consent so Google returns a refresh token the MCP server can use later;
      // select_account so the user can pick which Google account to connect.
      access_type: "offline",
      prompt: "select_account consent",
      state,
    })}`,
  exchange: (url, redirectUri) =>
    exchangeCode("https://oauth2.googleapis.com/token", {
      grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "",
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
    }),
  refresh: refreshGoogleToken,
  accountLabel: async (tokens) => {
    const data = await getJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    return typeof data?.emailAddress === "string" ? data.emailAddress : null;
  },
  usesState: true,
};
