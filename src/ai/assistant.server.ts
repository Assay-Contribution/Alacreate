/*  AI assistant for the notes composer. Served at /api/assistant by api/assistant.ts on
    Vercel and by the Vite dev middleware (vite.config.ts) locally. The client sends the
    user's most recent notes; since most notes are just notes, the model stays silent
    unless it is asked directly. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIST_FILES_TOOL, listFiles, supabaseFileSource } from "./mcp/list_files.server";
import { QUERY_FILE_TOOL, queryFile } from "./mcp/query_file.server";
import {
  chatWithTools,
  createUserClient,
  guardRequest,
  isShortString,
  json,
  readJson,
  type ChatMessage,
  type HandlerOptions,
  type ToolDefinition,
  type ToolRunner,
} from "./openai.server";

const MAX_MESSAGES = 10;
const NO_RESPONSE = "NO_RESPONSE";

const BASE_PROMPT =
  "You are an AI assistant built into a personal note-taking and work-log app. " +
  "The user writes quick notes to themselves throughout the day, and most notes are NOT " +
  "addressed to you. Only reply when the user's latest note directly asks you, the AI, " +
  "for something: it addresses you, asks you a question, or asks you to do something. " +
  "To-dos, reminders, and questions the user is jotting down for themselves are not " +
  `requests to you. If the latest note is not a request to you, reply with exactly ` +
  `${NO_RESPONSE} and nothing else. Judge the latest note on its own: earlier notes ` +
  "without a reply were simply not addressed to you, so they are no reason to stay " +
  "silent now. If the note is addressed to you, always reply, even when you can't do what " +
  `it asks: say briefly what you can't do. Never use ${NO_RESPONSE} just because a ` +
  "request is hard or impossible. When you do reply, be concise and helpful, and use the " +
  "earlier notes as context.";

const FILES_PROMPT =
  "You have two tools for the user's uploaded files. list_files shows the files uploaded " +
  "on a given day: each file's name, id, whether it's ready to search, a short preview, " +
  "and the messages sent around the upload. query_file searches the contents of one file " +
  "and returns the most relevant sections. To answer a question about what a file says, " +
  "call list_files to find the file's id, then call query_file with that id and a focused " +
  "query; call it again with different wording if the first results don't answer it. " +
  "Answer from the returned sections and cite page numbers when they're given. If the " +
  "user doesn't say which day, check today first, then earlier days if needed. If a file " +
  "isn't ready to search, tell the user and share what list_files shows instead.";

const NO_FILES_PROMPT =
  "You can't see the user's files right now because they aren't signed in; say so if asked.";

type AssistantRequest = { history: ChatMessage[]; today: string; timeZone: string };

export async function handleAssistant(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const rejection = await guardRequest(request, options);
  if (rejection) return rejection;

  const body = readRequest(await readJson(request));
  if (!body) return json({ error: "Invalid request body" }, 400);
  const { history, today, timeZone } = body;

  // Tools run as the signed-in user, so they can only ever see that user's files.
  const userDb = createUserClient(request);
  const tools: ToolDefinition[] = userDb ? [LIST_FILES_TOOL, QUERY_FILE_TOOL] : [];
  const system =
    `${BASE_PROMPT}\n\nToday is ${today} (the user's time zone is ${timeZone}).\n\n` +
    (userDb ? FILES_PROMPT : NO_FILES_PROMPT);

  const prompt = buildPrompt(history);
  const log = options.debug ? (line: string) => console.log(`[assistant] ${line}`) : undefined;
  log?.(`prompt:\n${prompt.content}`);
  const reply = await chatWithTools(
    [{ role: "system", content: system }, prompt],
    tools,
    userDb ? toolRunner(userDb, timeZone) : async () => "No tools are available.",
    500,
    log,
  );
  log?.(`raw model output: ${reply}`);
  if (reply === null) return json({ error: "Assistant unavailable" }, 502);
  return json({ reply: reply.includes(NO_RESPONSE) ? null : reply });
}

// Earlier notes go in as a labeled transcript rather than as chat turns. As chat turns,
// notes the AI stayed silent on look like requests it ignored, and the model starts
// copying that and ignoring real requests too.
function buildPrompt(history: ChatMessage[]): ChatMessage {
  const latest = history[history.length - 1].content;
  const earlier = history
    .slice(0, -1)
    .map((message) => `${message.role === "assistant" ? "AI" : "User"}: ${message.content}`);
  const context = earlier.length
    ? `Earlier notes from today, oldest first (context only):\n${earlier.join("\n")}\n\n`
    : "";
  return {
    role: "user",
    content: `${context}Latest note (decide whether this one is addressed to you):\n${latest}`,
  };
}

function toolRunner(db: SupabaseClient, timeZone: string): ToolRunner {
  return async (name, args) => {
    if (name === "list_files") {
      return listFiles(supabaseFileSource(db), { date: String(args.date ?? ""), timeZone });
    }
    if (name === "query_file") {
      return queryFile(db, {
        fileId: String(args.file_id ?? ""),
        query: String(args.query ?? ""),
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
    }
    return `There is no tool called ${name}.`;
  };
}

function readRequest(body: unknown): AssistantRequest | null {
  const history = readHistory(body);
  if (!history) return null;
  const { today, timeZone } = (body ?? {}) as { today?: unknown; timeZone?: unknown };
  const zone = typeof timeZone === "string" && isTimeZone(timeZone) ? timeZone : "UTC";
  const date =
    typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today)
      ? today
      : new Date().toLocaleDateString("en-CA", { timeZone: zone });
  return { history, today: date, timeZone: zone };
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function readHistory(body: unknown): ChatMessage[] | null {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }

  const history: ChatMessage[] = [];
  for (const message of messages) {
    const { role, text } = (message ?? {}) as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || !isShortString(text)) return null;
    history.push({ role, content: text });
  }
  return history[history.length - 1].role === "user" ? history : null;
}
