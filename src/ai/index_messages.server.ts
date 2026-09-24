/*  Makes chat messages searchable by the AI (query_history): embeds each message
    with OpenAI and stores it in message_chunks (schema_message_vectors.sql). The browser
    calls POST /api/index-messages after saving a note or an AI reply; the index-messages
    script uses indexMessages directly to catch up on older messages. Writes use the service
    role key (users can only read and delete their rows), with user_id always taken from the
    verified login token. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./embeddings.server";
import { bearerToken, createUserClient, json, readJson } from "./openai.server";
import { createAdminClient } from "./process_file.server";

const MAX_MESSAGES_PER_REQUEST = 50;
// Well under the embedding model's input limit; messages are rarely this long.
const MAX_EMBED_CHARS = 8000;

export type MessageToIndex = { text: string; addedAt: string; author?: "assistant" };

// Embeds the messages and saves them, replacing any earlier version (e.g. after an edit).
// Returns how many were saved.
export async function indexMessages(
  db: SupabaseClient,
  userId: string,
  date: string,
  messages: MessageToIndex[],
): Promise<number> {
  const valid = messages.filter((message) => message.text.trim());
  if (valid.length === 0) return 0;

  const embeddings = await embedTexts(valid.map((message) => message.text.slice(0, MAX_EMBED_CHARS)));
  const { error } = await db.from("message_chunks").upsert(
    valid.map((message, index) => ({
      user_id: userId,
      report_date: date,
      added_at: message.addedAt,
      author: message.author === "assistant" ? "assistant" : "user",
      content: message.text,
      embedding: embeddings[index],
    })),
    { onConflict: "user_id,added_at,author" },
  );
  if (error) throw new Error(`Couldn't save message embeddings: ${error.message}`);
  return valid.length;
}

// POST /api/index-messages { date, messages: [{ text, addedAt, author? }] }
export async function handleIndexMessages(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);

  // Always requires a login, even in dev: messages have to belong to someone.
  const token = bearerToken(request);
  const userDb = createUserClient(request);
  if (!token || !userDb) return json({ error: "Unauthorized" }, 401);
  const { data: auth } = await userDb.auth.getUser(token);
  if (!auth.user) return json({ error: "Unauthorized" }, 401);

  const body = readBody(await readJson(request));
  if (!body) return json({ error: "Invalid request body" }, 400);

  try {
    const indexed = await indexMessages(createAdminClient(), auth.user.id, body.date, body.messages);
    return json({ indexed });
  } catch (error) {
    console.error("[index_messages]", error);
    return json({ error: "Couldn't index messages" }, 502);
  }
}

function readBody(body: unknown): { date: string; messages: MessageToIndex[] } | null {
  const { date, messages } = (body ?? {}) as { date?: unknown; messages?: unknown };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (messages.length > MAX_MESSAGES_PER_REQUEST) return null;

  const valid: MessageToIndex[] = [];
  for (const message of messages) {
    const { text, addedAt, author } = (message ?? {}) as Record<string, unknown>;
    if (typeof text !== "string" || typeof addedAt !== "string") return null;
    if (Number.isNaN(new Date(addedAt).getTime())) return null;
    valid.push({ text, addedAt, author: author === "assistant" ? "assistant" : undefined });
  }
  return { date, messages: valid };
}
