// Vercel route for /api/summarize. The logic lives in src/ai/endpoints/summarize.server.ts.
import { handleSummarize } from "../src/ai/endpoints/summarize.server";

export function POST(request: Request): Promise<Response> {
  return handleSummarize(request);
}
