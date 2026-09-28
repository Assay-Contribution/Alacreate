// Vercel route for /api/summarize. The logic lives in src/ai/summarize.server.ts.
import { handleSummarize } from "../src/ai/summarize.server";

export function POST(request: Request): Promise<Response> {
  return handleSummarize(request);
}
