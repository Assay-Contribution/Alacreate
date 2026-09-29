# AI Tools for Connected Apps: Plan

_As of 2026-09-28_

## Goal

Users can now connect Google Drive, Gmail, Slack, Box, and GroupMe on the Integrations page (`/integrations.html`). Each connection saves an OAuth token for that user in Supabase (`integration_connections`). The next step is to give the AI assistant tools that use those tokens.

Our pitch is contribution reports that write themselves. The competitive landscape doc names the gap in other tools: "zero integration with the tools where the work actually happens… pure manual re-typing." So the tools should mainly answer one question: **what did this person actually do on a given day?** Searching and reading come second. Posting anywhere comes last, and only with the user's confirmation.

## Rule: the AI only gets tools for apps that are connected and working

If a user hasn't connected Slack, the AI never sees any Slack tools. If their Slack connection breaks (the token was revoked or expired and couldn't be refreshed), the Slack tools disappear until they reconnect.

Why:

- **Fewer wrong tool calls.** A small model like `gpt-4.1-mini` chooses tools less reliably as the list grows. Tools that can't work are pure noise.
- **Better answers.** Instead of calling a tool and hitting an error, the AI already knows what's connected. It can say "Connect Slack on the Integrations page and I can check that."
- **Safer.** The server only runs tools it offered for this request, so the model can't reach an app the user never connected.

### How it works

1. **Each request starts by loading the user's working connections.** The assistant already verifies who is signed in. It then reads that user's rows from `integration_connections` with the service-role key. The table has no RLS policies, so only the server can read it. A connection counts as working when:
   - the row exists and its status isn't `needs_reconnect`, and
   - its access token hasn't expired, or it has expired and a refresh with the saved refresh token succeeds. Google and Box tokens last about an hour, so this happens often.
2. **Each app declares its own tools.** A registry maps each app to its tool definitions, a tool runner, and a short paragraph for the system prompt. Each app gets its own server-only file in `src/ai/mcp/integrations/<app>.server.ts`, next to the existing tools in `src/ai/mcp/`. They should *not* go in `src/components/integrations/`, because the browser imports those files.
3. **The tool list is built from the connected apps.** The four existing tools (`list_files`, `query_file`, `get_messages`, `query_history`) are always included when the user is signed in. Each connected app then adds its tools. `get_work_activity` is added if at least one app is connected, and it only checks the connected apps.
4. **The system prompt lists what's connected and what isn't.** Example: "Connected: Google Drive (alex@company.com), Slack (Acme workspace). Not connected: Gmail, Box, GroupMe; if asked about these, tell the user they can connect them on the Integrations page."
5. **The tool runner only runs tools it offered.** If the model asks for any other tool, it gets "That tool isn't available."
6. **Broken tokens get marked.** If an app returns 401 during a tool call, or a refresh fails, the connection is marked `needs_reconnect`. It's then excluded from the next request, and the Integrations page shows a "Reconnect" button.

We don't test each connection with a live API call on every message. That would add a delay to every reply. Expiry times plus the refresh step catch almost everything, and step 6 catches the rest.

### Sketch

```ts
// src/ai/endpoints/assistant.server.ts
const userId = await signedInUserId(request);
const connections = userId ? await loadWorkingConnections(userId) : [];   // refreshes tokens as needed

const appTools = connections.flatMap((c) => APP_TOOLS[c.provider].tools);
const tools = userDb
  ? [LIST_FILES_TOOL, QUERY_FILE_TOOL, GET_MESSAGES_TOOL, QUERY_HISTORY_TOOL,
     ...(connections.length ? [GET_WORK_ACTIVITY_TOOL] : []), ...appTools]
  : [];
const system = `${BASE_PROMPT}\n\n…\n\n${TOOLS_PROMPT}\n\n${connectedAppsPrompt(connections)}`;
```

### Database change

Add two columns to `integration_connections`:

- `status text not null default 'active'`: either `active` or `needs_reconnect`
- `last_error text`: the most recent failure, shown on the Integrations page

## Tools to build

### 1. `get_work_activity(date)`: build first

Checks every connected app and returns one time-ordered list of what the user did that day: Drive files they edited, emails they sent, messages they posted in Slack and GroupMe, and Box files they changed.

This one tool covers most of what daily reports need. It also means the AI usually needs one tool call instead of choosing between a dozen similar ones.

### 2. Tools for each app

| App | Tools | Notes |
|---|---|---|
| Google Drive | `drive_search(query)`, `drive_read_file(file_id, query?)` | Google Docs can be exported as text and searched in sections, like `query_file` does. The current scope (`drive.readonly`) is enough. |
| Gmail | `gmail_search(query, after?, before?)`, `gmail_read_thread(thread_id)` | Return the subject, sender, and a short preview by default; full text only when asked. The current scope (`gmail.readonly`) is enough, but Google treats it as *restricted* (see open questions). |
| Slack | `slack_search(query)`, `slack_read_channel(channel, date)` | **The current scopes (`channels:read`, `chat:write`) can't read messages.** We need `channels:history`, plus a user-level `search:read` scope to search the user's own messages. |
| Box | `box_search(query)`, `box_read_file(file_id, query?)` | The Box events API can show what the user changed on a given day. |
| GroupMe | `groupme_my_messages(date)` | GroupMe has no search, so this goes through each group and keeps the user's messages. It's slow, so cap how many groups it checks. |

### 3. Tools that take actions: later, and always confirmed

- `slack_post_report(channel, report)` posts a finished daily or weekly report to the team's Slack. Competing standup tools do well partly because they live in Slack. The user confirms in the app before anything is posted.
- We are not planning tools that send email or edit files.

## Groundwork

- **Token helper with refresh.** One function, `getAccessToken(userId, provider)`, returns a working token and uses the refresh token when it has expired. Every tool uses it. Without refresh, the Google and Box tools stop working an hour after connecting.
- **Small results.** Return short summaries with ids, and let the AI call a read tool for the full text. Our existing tools already work this way.
- **Privacy.** Read only what the user's own account can see. Never store email or message contents, apart from files the user uploads themselves.
- **Encrypt tokens** in `integration_connections` before real users connect accounts.
- **About "MCP":** our current "MCP" tools are OpenAI function-calling tools that run inside our own server, not a real MCP server. We'll keep that pattern for now. Once the tools are stable, we can package them as a real MCP server so outside AI clients (like Claude) can use them too, without rewriting the tools.

## Order

| Step | Work |
|---|---|
| 1 | Token helper with refresh; `status` and `last_error` columns; "Reconnect" on the Integrations page |
| 2 | Tool registry and the connected-only tool list in the assistant |
| 3 | `get_work_activity` for Drive and Gmail, whose scopes already work |
| 4 | New Slack scopes, then add Slack to `get_work_activity`, plus `slack_search` |
| 5 | Search and read tools for each app |
| 6 | GroupMe, after the Vercel HTTPS setup (GroupMe only accepts an `https` callback URL) |
| 7 | `slack_post_report` with in-app confirmation |

## Open questions

- **Gmail verification.** Google treats `gmail.readonly` as a restricted scope. While our Google app is in Testing mode, only listed test users can connect Gmail. Publishing the app requires Google's security review, which can take weeks. Do we start that now, or keep Gmail limited to testers for the pilot?
- **Slack scopes.** Reading messages needs broader Slack permissions than we request now. Are pilot teams comfortable with that, or should Slack start as posting only?
- **What to keep.** Should `get_work_activity` results be saved alongside the daily report as evidence, or fetched fresh each time and never stored?
