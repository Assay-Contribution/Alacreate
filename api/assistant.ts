// Vercel route for /api/assistant. The logic lives in src/ai/assistant.server.ts.
import { handleAssistant } from "../src/ai/assistant.server";

export function POST(request: Request): Promise<Response> {
  return handleAssistant(request);
}
