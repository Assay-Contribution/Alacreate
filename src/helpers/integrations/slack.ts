/*  Slack: installs the app into a workspace to list public channels and post messages.
    Redirect URL to register at api.slack.com/apps: <origin>/auth/slack/callback
*/
import { env, exchangeCode, getJson } from "../oauth.js";
import type { Integration } from "../../types/integrations.js";

export const slack: Integration = {
  provider: "slack",
  name: "Slack",
  description: "See your workspace's public channels and post messages.",
  clientIdEnv: "SLACK_CLIENT_ID",
  authorizeUrl: (clientId, redirectUri, state) =>
    `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
      client_id: clientId,
      scope: "channels:read,chat:write",
      redirect_uri: redirectUri,
      state,
    })}`,
  exchange: (url, redirectUri) =>
    exchangeCode("https://slack.com/api/oauth.v2.access", {
      code: url.searchParams.get("code") ?? "",
      client_id: env("SLACK_CLIENT_ID"),
      client_secret: env("SLACK_CLIENT_SECRET"),
      redirect_uri: redirectUri,
    }),
  accountLabel: async (tokens) => {
    const data = await getJson("https://slack.com/api/auth.test", {
      authorization: `Bearer ${tokens.accessToken}`,
    });
    return typeof data?.team === "string" ? data.team : null;
  },
  usesState: true,
};
