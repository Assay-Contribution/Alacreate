/*  query_file tool: searches one processed file for the sections that best answer a
    question, using hybrid search (meaning + keywords) over its embedded chunks.
    `db` must be a Supabase client created with the signed-in user's token, so Row Level
    Security keeps the search inside that user's own files, whatever id the AI passes. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "../embeddings.server";

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tool definition in the format OpenAI function calling expects.
export const QUERY_FILE_TOOL = {
  type: "function",
  function: {
    name: "query_file",
    description:
      "Search the contents of one uploaded file and return the sections most relevant to " +
      "a question, with page numbers. Get file ids from list_files first.",
    parameters: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "The file's id, as shown by list_files." },
        query: {
          type: "string",
          description: "What to look for, as a question or a short description.",
        },
        limit: {
          type: "integer",
          description: `How many sections to return (default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`,
        },
      },
      required: ["file_id", "query"],
      additionalProperties: false,
    },
  },
} as const;

export type QueryFileOptions = {
  fileId: string;
  query: string;
  limit?: number;
};

type Match = {
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  content: string;
};

export async function queryFile(db: SupabaseClient, options: QueryFileOptions): Promise<string> {
  const fileId = options.fileId.trim();
  const query = options.query.trim();
  const limit = Math.min(Math.max(Math.round(options.limit ?? DEFAULT_RESULTS), 1), MAX_RESULTS);

  if (!query) return "The query is empty. Describe what to look for in the file.";
  if (!UUID_PATTERN.test(fileId)) {
    return `"${fileId}" is not a valid file id. Call list_files to see the ids of the user's files.`;
  }

  // RLS hides other users' files, so someone else's id looks the same as a missing one.
  const { data: file, error } = await db
    .from("files")
    .select("name, status, error, chunk_count")
    .eq("id", fileId)
    .maybeSingle();
  if (error) return `Couldn't look up the file: ${error.message}`;
  if (!file) return `No file with id ${fileId}. Call list_files to see the ids of the user's files.`;

  if (file.status === "pending" || file.status === "processing") {
    return `${file.name} is still being processed and can't be searched yet. Try again in a minute.`;
  }
  if (file.status !== "ready") {
    return `${file.name} can't be searched: ${file.error ?? "it hasn't been processed."}`;
  }

  let queryEmbedding: number[];
  try {
    [queryEmbedding] = await embedTexts([query]);
  } catch (embedError) {
    console.error("[query_file]", embedError);
    return "Search is unavailable right now. Try again shortly.";
  }

  const { data: matches, error: searchError } = await db.rpc("match_file_chunks", {
    query_embedding: queryEmbedding,
    query_text: query,
    match_count: limit,
    filter_file_id: fileId,
  });
  if (searchError) return `Search failed: ${searchError.message}`;
  if (!matches || matches.length === 0) {
    return `No sections of ${file.name} matched "${query}". Try different wording.`;
  }

  const sections = (matches as Match[]).map(
    (match, index) => `${index + 1}. ${pageLabel(match)}\n${match.content}`,
  );
  const hasPages = (matches as Match[]).some((match) => match.page_start !== null);
  return [
    `Top ${matches.length} of ${file.chunk_count} sections in ${file.name} for "${query}" ` +
      "(best match first):",
    ...sections,
    (hasPages
      ? "Cite page numbers when answering."
      : "This file has no page numbers, so don't cite pages; refer to it by name instead.") +
      " For more, call query_file again with a narrower or differently worded query.",
  ].join("\n\n");
}

function pageLabel(match: Match): string {
  if (match.page_start === null) return `[section ${match.chunk_index + 1}]`;
  return match.page_start === match.page_end
    ? `[page ${match.page_start}]`
    : `[pages ${match.page_start}-${match.page_end}]`;
}
