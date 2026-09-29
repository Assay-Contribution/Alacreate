// Vercel route for /api/generate-report. The logic lives in src/ai/endpoints/generate_report.server.ts.
import { handleGenerateReport } from "../src/ai/endpoints/generate_report.server";

export function POST(request: Request): Promise<Response> {
  return handleGenerateReport(request);
}
