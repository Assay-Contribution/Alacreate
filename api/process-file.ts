// Vercel route for /api/process-file. The logic lives in src/ai/endpoints/process_file.server.ts.
import { handleProcessUpload } from "../src/ai/endpoints/process_file.server";

export function POST(request: Request): Promise<Response> {
  return handleProcessUpload(request);
}
