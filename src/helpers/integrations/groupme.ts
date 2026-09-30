/*  GroupMe: see the groups the user belongs to.
    Callback URL to register at dev.groupme.com: <origin>/auth/groupme/callback
    GroupMe always redirects to that registered URL (no redirect_uri parameter), sends the
    access token straight back (no code exchange or client secret), and has no state parameter.
*/
import { getJson } from "../oauth.js";
import type { Integration } from "../../types/integrations.js";

export const groupme: Integration = {
  provider: "groupme",
  name: "GroupMe",
  description: "See the GroupMe groups you belong to.",
  clientIdEnv: "GROUPME_CLIENT_ID",
  authorizeUrl: (clientId) =>
    `https://oauth.groupme.com/oauth/authorize?${new URLSearchParams({ client_id: clientId })}`,
  exchange: async (url) => {
    const accessToken = url.searchParams.get("access_token");
    if (!accessToken) throw new Error("GroupMe did not return an access token");
    return { accessToken, refreshToken: null, expiresIn: null, scopes: null };
  },
  accountLabel: async (tokens) => {
    const data = await getJson("https://api.groupme.com/v3/users/me", {
      "x-access-token": tokens.accessToken,
    });
    const name = (data?.response as Record<string, unknown> | undefined)?.name;
    return typeof name === "string" ? name : null;
  },
  usesState: false,
};
