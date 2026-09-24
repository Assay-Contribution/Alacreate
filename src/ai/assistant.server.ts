/*  AI assistant for the notes composer. Served at /api/assistant by api/assistant.ts on
    Vercel and by the Vite dev middleware (vite.config.ts) locally. The client sends the
    user's most recent notes; since most notes are just notes, the model stays silent
    unless it is asked directly. */
import {
  chat,
  guardRequest,
  isShortString,
  json,
  readJson,
  type ChatMessage,
  type HandlerOptions,
} from "./openai.server";

const MAX_MESSAGES = 10;
const NO_RESPONSE = "NO_RESPONSE";

const SYSTEM_PROMPT =
  "You are an AI assistant built into a personal note-taking and work-log app. " +
  "The user writes quick notes to themselves throughout the day, and most notes are NOT " +
  "addressed to you. Only reply when the user's latest note directly asks you, the AI, " +
  "for something: it addresses you, asks you a question, or asks you to do something. " +
  "To-dos, reminders, and questions the user is jotting down for themselves are not " +
  `requests to you. If the latest note is not a request to you, reply with exactly ` +
  `${NO_RESPONSE} and nothing else. When you do reply, be concise and helpful, and use ` +
  "the earlier notes as context.";

export async function handleAssistant(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const rejection = await guardRequest(request, options);
  if (rejection) return rejection;

  const history = readHistory(await readJson(request));
  if (!history) return json({ error: "Invalid request body" }, 400);

  const reply = await chat([{ role: "system", content: SYSTEM_PROMPT }, ...history], 500);
  if (reply === null) return json({ error: "Assistant unavailable" }, 502);
  return json({ reply: reply.includes(NO_RESPONSE) ? null : reply });
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
