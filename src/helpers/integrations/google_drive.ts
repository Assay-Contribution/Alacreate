/*  Google Drive: read-only Drive access plus the user's Google profile and email.
    Redirect URI to register in Google Cloud Console: <origin>/auth/google/callback
*/
import { env, exchangeCode, getJson, refreshGoogleToken } from "../oauth";
import type { Integration } from "../../types/integrations";

export const googleDrive: Integration = {
  provider: "google",
  name: "Google Drive",
  description: "Read-only access to your Drive files, plus your Google profile and email.",
  clientIdEnv: "GOOGLE_CLIENT_ID",
  authorizeUrl: (clientId, redirectUri, state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
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
    const data = await getJson("https://openidconnect.googleapis.com/v1/userinfo", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    return typeof data?.email === "string" ? data.email : null;
  },
  usesState: true,
};
