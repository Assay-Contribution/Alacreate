# src/ai

The AI and OAuth backend. Everything in here runs only on the server (Vercel functions and the Vite dev middleware); browser code never imports from `src/ai/`. The browser calls these endpoints through `src/services/`.

| Folder | What's in it |
|---|---|
| `endpoints/` | One file per API route. `api/<route>.ts` (on Vercel) and `vite.config.ts` (in dev) just call the `handle…` function in here. |
| `mcp/` | Tools the AI can call during a chat: `list_files`, `query_file`, `get_messages`, `query_history`, and, only when the user has a working Google Drive connection, `drive_search` and `drive_read_file`. Each tool runs as the signed-in user. |
| `lib/` | Shared building blocks: `openai.server.ts` (models, chat, tool calling), `http.server.ts` (request checks, JSON responses), `supabase.server.ts` (user and admin database clients), `connections.server.ts` (the user's connected apps and working access tokens, refreshed when expired), `embeddings.server.ts`, and `extract_text.server.ts`. (`shorten_ai_reply.ts`, used by both the browser and the `get_messages` tool, is in `src/helpers/`.) |

## Endpoints

| Route | File |
|---|---|
| `POST /api/assistant` | `endpoints/assistant.server.ts` |
| `POST /api/summarize` | `endpoints/summarize.server.ts` |
| `POST /api/generate-report` | `endpoints/generate_report.server.ts` |
| `POST /api/process-file` | `endpoints/process_file.server.ts` |
| `POST /api/index-messages` | `endpoints/index_messages.server.ts` |
| `GET/POST/DELETE /api/integrations`, `GET /auth/<provider>/callback` | `endpoints/integrations.server.ts` (each app's details are in `src/helpers/integrations/`) |
