// Vercel route for /auth/<provider>/callback (rewritten here by vercel.json). The logic lives in src/ai/endpoints/integrations.server.ts.
import { handleOAuthCallback } from "../../../src/ai/endpoints/integrations.server";

export function GET(request: Request): Promise<Response> {
  return handleOAuthCallback(request);
}
