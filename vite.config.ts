import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolve } from "node:path";
import { handleAssistant } from "./src/ai/endpoints/assistant.server";
import { handleGenerateReport } from "./src/ai/endpoints/generate_report.server";
import { handleIndexMessages } from "./src/ai/endpoints/index_messages.server";
import { handleIntegrations, handleOAuthCallback } from "./src/ai/endpoints/integrations.server";
import type { Handler } from "./src/ai/lib/http.server";
import { handleProcessUpload } from "./src/ai/endpoints/process_file.server";
import { handleSummarize } from "./src/ai/endpoints/summarize.server";

// Each page lives in its own folder, src/pages/<name>/<name>.html (with its <name>.ts), but is
// still served at /<name>.html (and the home page at /). Nav links and OAuth redirects rely
// on those URLs.
const PAGES = ["index", "signup", "reporting", "integrations"];

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
    // The HTML pages live in src/pages/ but keep their URLs (/signup.html, ...), which nav
    // links and the OAuth redirects rely on.
    root: resolve(__dirname, "src/pages"),
    // .env files and public/ stay at the project root. Without envDir, Vite would look for
    // .env in src/pages and the VITE_ values (Supabase URL and key) would silently be missing.
    envDir: __dirname,
    publicDir: resolve(__dirname, "public"),
    // Pages reference shared files as /src/... (e.g. /src/styles.css); map that back to the
    // real src/ folder, since it sits outside the src/pages root.
    resolve: { alias: [{ find: /^\/src\//, replacement: `${resolve(__dirname, "src")}/` }] },
    plugins: [pageFolders(), devApi()],
    // Port 3000 so the OAuth redirect URIs registered with each provider
    // (http://localhost:3000/auth/<provider>/callback) point at this dev server.
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true },
    build: {
      // Still dist/ at the project root, where Vercel expects it.
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          home: resolve(__dirname, "src/pages/index/index.html"),
          signup: resolve(__dirname, "src/pages/signup/signup.html"),
          reporting: resolve(__dirname, "src/pages/reporting/reporting.html"),
          integrations: resolve(__dirname, "src/pages/integrations/integrations.html"),
        },
      },
    },
  };
});

// Keeps page URLs flat while the files live in per-page folders: in dev, /signup.html is
// served from signup/signup.html; in the build, signup/signup.html is written as signup.html.
function pageFolders(): Plugin {
  return {
    name: "page-folders",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        const name = path === "/" ? "index" : path.match(/^\/([\w-]+)\.html$/)?.[1];
        if (name && PAGES.includes(name)) {
          req.url = `/${name}/${name}.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
    generateBundle: {
      // After Vite has added the HTML pages to the output.
      order: "post",
      handler(_options, bundle) {
        for (const [fileName, file] of Object.entries(bundle)) {
          const name = fileName.match(/^([\w-]+)\/\1\.html$/)?.[1];
          if (!name || !PAGES.includes(name)) continue;
          delete bundle[fileName];
          file.fileName = `${name}.html`;
          bundle[file.fileName] = file;
        }
      },
    },
  };
}

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
