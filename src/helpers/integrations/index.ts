// Every app the Integrations page lists, in display order. Add a new app by creating its
// file in this folder and listing it here.
import { box } from "./box.js";
import { email } from "./email.js";
import { googleDrive } from "./google_drive.js";
import { groupme } from "./groupme.js";
import type { Integration } from "../../types/integrations.js";
import { slack } from "./slack.js";

export type { Integration } from "../../types/integrations.js";

export const INTEGRATIONS: Integration[] = [googleDrive, email, slack, box, groupme];

export function findIntegration(provider: unknown): Integration | null {
  return INTEGRATIONS.find((integration) => integration.provider === provider) ?? null;
}
