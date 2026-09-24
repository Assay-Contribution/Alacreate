import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolve } from "node:path";
import { handleAssistant } from "./src/ai/assistant.server";
import { handleIndexMessages } from "./src/ai/index_messages.server";
import type { Handler } from "./src/ai/openai.server";
import { handleProcessUpload } from "./src/ai/process_file.server";
import { handleSummarize } from "./src/ai/summarize.server";

const DEV_ROUTES: Record<string, Handler> = {
  "/api/summarize": handleSummarize,
  "/api/assistant": handleAssistant,
  "/api/process-file": handleProcessUpload,
  "/api/index-messages": handleIndexMessages,
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
    build: {
      rollupOptions: {
        input: {
          home: resolve(__dirname, "index.html"),
          signup: resolve(__dirname, "signup.html"),
          reporting: resolve(__dirname, "reporting.html"),
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

          const request = new Request(`http://localhost${route}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request, { requireAuth: false, debug: true });

          res.statusCode = response.status;
          res.setHeader("content-type", response.headers.get("content-type") ?? "application/json");
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
