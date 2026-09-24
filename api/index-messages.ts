// Vercel route for /api/index-messages. The logic lives in src/ai/index_messages.server.ts.
import { handleIndexMessages } from "../src/ai/index_messages.server";

export function POST(request: Request): Promise<Response> {
  return handleIndexMessages(request);
}
