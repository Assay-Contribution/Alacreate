// Vercel route for /api/integrations. The logic lives in src/ai/endpoints/integrations.server.ts.
import { handleIntegrations } from "../src/ai/endpoints/integrations.server";

export function GET(request: Request): Promise<Response> {
  return handleIntegrations(request);
}

export function POST(request: Request): Promise<Response> {
  return handleIntegrations(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handleIntegrations(request);
}
