// Types for the connectable apps in src/helpers/integrations/ and the tokens their sign-ins return.

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
