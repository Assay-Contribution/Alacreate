// Vercel route for /api/assistant. The logic lives in src/ai/endpoints/assistant.server.ts.
import { handleAssistant } from "../src/ai/endpoints/assistant.server.js";

export function POST(request: Request): Promise<Response> {
  return handleAssistant(request);
}
