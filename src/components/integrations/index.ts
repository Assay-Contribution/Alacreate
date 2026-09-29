// Every app the Integrations page lists, in display order. Add a new app by creating its
// file in this folder and listing it here.
import { box } from "./box";
import { email } from "./email";
import { googleDrive } from "./google_drive";
import { groupme } from "./groupme";
import type { Integration } from "./shared";
import { slack } from "./slack";

export type { Integration } from "./shared";

export const INTEGRATIONS: Integration[] = [googleDrive, email, slack, box, groupme];

export function findIntegration(provider: unknown): Integration | null {
  return INTEGRATIONS.find((integration) => integration.provider === provider) ?? null;
}
