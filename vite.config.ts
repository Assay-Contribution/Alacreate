import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolve } from "node:path";
import { handleAssistant } from "./src/ai/endpoints/assistant.server";
import { handleGenerateReport } from "./src/ai/endpoints/generate_report.server";
import { handleIndexMessages } from "./src/ai/endpoints/index_messages.server";
import { handleIntegrations, handleOAuthCallback } from "./src/ai/endpoints/integrations.server";
import type { Handler } from "./src/ai/lib/http.server";
import { handleProcessUpload } from "./src/ai/endpoints/process_file.server";
import { handleSummarize } from "./src/ai/endpoints/summarize.server";

const DEV_ROUTES: Record<string, Handler> = {
  "/api/summarize": handleSummarize,
  "/api/assistant": handleAssistant,
  "/api/process-file": handleProcessUpload,
  "/api/index-messages": handleIndexMessages,
  "/api/generate-report": handleGenerateReport,
  "/api/integrations": handleIntegrations,
  // Matches /auth/<provider>/callback: the middleware matches by path prefix.
  "/auth": handleOAuthCallback,
};

export default defineConfig(({ mode }) => {
  // Make non-VITE_ secrets (e.g. API_KEY) from .env.local visible to the
  // dev API middleware. Only VITE_-prefixed values ever reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [name, value] of Object.entries(env)) {
    process.env[name] ??= value;
  }

  return {
    plugins: [devApi()],
    // Port 3000 so the OAuth redirect URIs registered with each provider
    // (http://localhost:3000/auth/<provider>/callback) point at this dev server.
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true },
    build: {
      rollupOptions: {
        input: {
          home: resolve(__dirname, "index.html"),
          signup: resolve(__dirname, "signup.html"),
          reporting: resolve(__dirname, "reporting.html"),
          integrations: resolve(__dirname, "integrations.html"),
        },
      },
    },
  };
});

// Serves the AI backend during `npm run dev`; on Vercel, the files in api/ do this.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      for (const [route, handler] of Object.entries(DEV_ROUTES)) {
        server.middlewares.use(route, async (req, res) => {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);

          // The full URL (path and query) and cookies matter to the OAuth callback.
          const request = new Request(`http://${req.headers.host ?? "localhost"}${req.originalUrl ?? route}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const response = await handler(request, { requireAuth: false, debug: true });

          res.statusCode = response.status;
          res.setHeader("content-type", response.headers.get("content-type") ?? "application/json");
          // Redirects and cookies, for the OAuth routes.
          const location = response.headers.get("location");
          if (location) res.setHeader("location", location);
          const cookies = response.headers.getSetCookie();
          if (cookies.length) res.setHeader("set-cookie", cookies);
          // Pass the body through as it arrives, so streamed AI replies stream in dev too.
          if (response.body) {
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        });
      }
    },
  };
}
