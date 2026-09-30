/*  Box: browse the files and folders in the user's Box account.
    Redirect URI to register in the Box Developer Console: <origin>/auth/box/callback
*/
import { env, exchangeCode, getJson } from "../oauth.js";
import type { Integration } from "../../types/integrations.js";

export const box: Integration = {
  provider: "box",
  name: "Box",
  description: "Browse the files and folders in your Box account.",
  clientIdEnv: "BOX_CLIENT_ID",
  authorizeUrl: (clientId, redirectUri, state) =>
    `https://account.box.com/api/oauth2/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    })}`,
  exchange: (url) =>
    exchangeCode("https://api.box.com/oauth2/token", {
      grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "",
      client_id: env("BOX_CLIENT_ID"),
      client_secret: env("BOX_CLIENT_SECRET"),
    }),
  accountLabel: async (tokens) => {
    const data = await getJson("https://api.box.com/2.0/users/me", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    return typeof data?.login === "string" ? data.login : null;
  },
  usesState: true,
};
