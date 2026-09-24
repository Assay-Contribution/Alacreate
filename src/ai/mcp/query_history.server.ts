/*  query_history tool: searches everything the user has written (their notes and the AI's
    replies), across all days, by meaning and keywords, within a token budget. `db` must be
    a Supabase client created with the signed-in user's token, so Row Level Security keeps
    results to that user's messages. Token counts are estimated at ~4 characters per token. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "../embeddings.server";

const DEFAULT_MAX_TOKENS = 1500;
const MAX_MAX_TOKENS = 4000;
const CHARS_PER_TOKEN = 4;
// Candidates fetched from the database before the token budget is applied.
const MATCH_COUNT = 40;

const maxTokensParameter = {
  type: "integer",
  description: `Rough size limit for the result (default ${DEFAULT_MAX_TOKENS}, max ${MAX_MAX_TOKENS}).`,
} as const;

// Tool definition in the format OpenAI function calling expects.
export const QUERY_HISTORY_TOOL = {
  type: "function",
  function: {
    name: "query_history",
    description:
      "Search everything the user has ever written (and your replies), across all days, " +
      "for a topic. Returns the most relevant messages with their dates and times, best " +
      "match first. Use it when you don't know which day something was said.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, as a question or topic." },
        max_tokens: maxTokensParameter,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
} as const;

export type QueryHistoryOptions = {
  query: string;
  maxTokens?: number;
  // The user's IANA time zone, for the times shown.
  timeZone?: string;
};

type Match = { report_date: string; added_at: string; author: string; content: string };

export async function queryHistory(
  db: SupabaseClient,
  options: QueryHistoryOptions,
): Promise<string> {
  const { timeZone = "UTC" } = options;
  const query = options.query.trim();
  if (!query) return "The query is empty. Describe what to look for.";
  const maxTokens = Math.min(
    Math.max(Math.round(options.maxTokens ?? DEFAULT_MAX_TOKENS), 100),
    MAX_MAX_TOKENS,
  );

  let queryEmbedding: number[];
  try {
    [queryEmbedding] = await embedTexts([query]);
  } catch (error) {
    console.error("[query_history]", error);
    return "Search is unavailable right now. Try again shortly.";
  }

  const { data, error } = await db.rpc("match_message_chunks", {
    query_embedding: queryEmbedding,
    query_text: query,
    match_count: MATCH_COUNT,
    filter_date: null,
  });
  if (error) return `Search failed: ${error.message}`;
  const matches = (data ?? []) as Match[];
  if (matches.length === 0) return `No messages matched "${query}".`;

  // Keep the best matches that fit the budget.
  const lines: string[] = [];
  let budget = maxTokens * CHARS_PER_TOKEN;
  for (const match of matches) {
    let line = formatMatch(match, timeZone);
    if (line.length > budget) {
      if (lines.length > 0) break;
      line = `${line.slice(0, budget)}… [cut off to fit max_tokens]`;
    }
    lines.push(line);
    budget -= line.length;
  }

  const hidden = matches.length - lines.length;
  return [
    `Messages matching "${query}" (best match first):`,
    lines.join("\n"),
    ...(hidden > 0
      ? [`${hidden} more match${hidden === 1 ? "" : "es"} not shown (raise max_tokens to see more).`]
      : []),
    "Some matches may be only loosely related; ignore those. To see the whole conversation " +
      "around a match, call get_messages with its date.",
  ].join("\n\n");
}

function formatMatch(match: Match, timeZone: string): string {
  const time = new Date(match.added_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  const who = match.author === "assistant" ? "AI" : "User";
  const text = match.content.replace(/\s+/g, " ").trim();
  return `${match.report_date} ${time}  ${who}: ${text}`;
}
