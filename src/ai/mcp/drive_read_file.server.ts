/*  drive_read_file tool: reads one file from the user's Google Drive. With a query, it
    splits the text into sections, embeds them, and returns the ones closest in meaning to
    the query (like query_file does for uploads, but on the fly: nothing is stored). Without
    a query, it returns the start of the file. `accessToken` must be the signed-in user's
    own Google token (from lib/connections.server.ts), so only their files can be read.
    Supported: Google Docs, Slides, and Sheets (first sheet), PDFs, and plain-text files. */
import { embedTexts } from "../lib/embeddings.server.js";
import { chunkPages, extractPages, words, type Chunk } from "../lib/extract_text.server.js";
import { DRIVE_TYPE_NAMES, driveError } from "./drive_search.server.js";

const DEFAULT_RESULTS = 4;
const MAX_RESULTS = 8;
// Without a query, return about this many words from the start of the file.
const PREVIEW_WORDS = 1200;
// Caps download size and embedding cost for huge files (~100 pages of text).
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_CHUNKS = 150;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

// Google's own formats are exported as text; everything else is downloaded as-is.
const EXPORT_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

// Tool definition in the format OpenAI function calling expects.
export const DRIVE_READ_FILE_TOOL = {
  type: "function",
  function: {
    name: "drive_read_file",
    description:
      "Read a file from the user's Google Drive. With a query, returns the sections most " +
      "relevant to it; without one, returns the start of the file. Get file ids from " +
      "drive_search first. Works for Google Docs, Slides, Sheets (first sheet only), PDFs, " +
      "and text files.",
    parameters: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "The file's id, as shown by drive_search." },
        query: {
          type: "string",
          description:
            "What to look for in the file, as a question or short description. Leave out " +
            "to get the start of the file.",
        },
        limit: {
          type: "integer",
          description: `How many sections to return with a query (default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`,
        },
      },
      required: ["file_id"],
      additionalProperties: false,
    },
  },
} as const;

export type DriveReadFileOptions = { fileId: string; query?: string; limit?: number };

type DriveFileInfo = { name: string; mimeType: string; size?: string; modifiedTime: string };

export async function driveReadFile(
  accessToken: string,
  options: DriveReadFileOptions,
): Promise<string> {
  const fileId = options.fileId.trim();
  const query = options.query?.trim() ?? "";
  const limit = Math.min(Math.max(Math.round(options.limit ?? DEFAULT_RESULTS), 1), MAX_RESULTS);
  if (!FILE_ID_PATTERN.test(fileId)) {
    return `"${fileId}" isn't a valid Drive file id. Call drive_search to find the file's id.`;
  }

  const headers = { authorization: `Bearer ${accessToken}` };
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

  const infoResponse = await fetch(
    `${base}?fields=name,mimeType,size,modifiedTime&supportsAllDrives=true`,
    { headers },
  );
  if (!infoResponse.ok) return driveError(infoResponse.status, await infoResponse.text());
  const file = (await infoResponse.json()) as DriveFileInfo;
  const typeName = DRIVE_TYPE_NAMES[file.mimeType] ?? file.mimeType;

  const read = await readPages(base, headers, file);
  if ("error" in read) return read.error;
  const { pages, hasPageNumbers } = read;
  const totalWords = pages.reduce((sum, page) => sum + words(page).length, 0);
  if (totalWords === 0) {
    return `${file.name} (${typeName}) has no readable text. It may be scanned images or empty.`;
  }

  const header = `${file.name} (${typeName}, ${totalWords.toLocaleString()} words, modified ${file.modifiedTime.slice(0, 10)})`;
  if (!query) return startOfFile(header, pages, totalWords);

  const chunks = chunkPages(pages, hasPageNumbers).slice(0, MAX_CHUNKS);
  let ranked: Chunk[];
  try {
    ranked = await rankByMeaning(chunks, query, limit);
  } catch (embedError) {
    console.error("[drive_read_file]", embedError);
    return "Searching inside the file is unavailable right now. Try again without a query to read the start of it.";
  }

  const sections = ranked.map(
    (chunk, index) => `${index + 1}. ${sectionLabel(chunk, chunks.indexOf(chunk))}\n${chunk.content}`,
  );
  return [
    `${header}. Top ${ranked.length} of ${chunks.length} sections for "${query}" (best match first):`,
    ...sections,
    (hasPageNumbers
      ? "Cite page numbers when answering."
      : "This file has no page numbers; refer to it by name.") +
      " For more, call drive_read_file again with a narrower or differently worded query.",
  ].join("\n\n");
}

// Gets the file's text as pages: exported for Google formats, downloaded for the rest.
async function readPages(
  base: string,
  headers: Record<string, string>,
  file: DriveFileInfo,
): Promise<{ pages: string[]; hasPageNumbers: boolean } | { error: string }> {
  const typeName = DRIVE_TYPE_NAMES[file.mimeType] ?? file.mimeType;
  const exportType = EXPORT_TYPES[file.mimeType];
  if (exportType) {
    const response = await fetch(`${base}/export?mimeType=${encodeURIComponent(exportType)}`, { headers });
    if (!response.ok) return { error: driveError(response.status, await response.text()) };
    return { pages: [await response.text()], hasPageNumbers: false };
  }

  const kind =
    file.mimeType === "application/pdf" ? "pdf"
    : file.mimeType.startsWith("text/") || file.mimeType === "application/json" ? "text"
    : null;
  if (!kind) {
    return {
      error:
        `${file.name} (${typeName}) can't be read yet (supported: ` +
        "Google Docs, Slides, Sheets, PDFs, and text files). Tell the user and share its link instead.",
    };
  }
  if (Number(file.size ?? 0) > MAX_DOWNLOAD_BYTES) {
    return { error: `${file.name} is too large to read (over ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB).` };
  }

  const response = await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers });
  if (!response.ok) return { error: driveError(response.status, await response.text()) };
  try {
    const pages = await extractPages(new Uint8Array(await response.arrayBuffer()), kind);
    return { pages, hasPageNumbers: kind === "pdf" };
  } catch (parseError) {
    console.error("[drive_read_file] couldn't read file", parseError);
    return { error: `${file.name} couldn't be read: the file may be damaged or password-protected.` };
  }
}

function startOfFile(header: string, pages: string[], totalWords: number): string {
  const opening = words(pages.join(" ")).slice(0, PREVIEW_WORDS).join(" ");
  const cut = totalWords > PREVIEW_WORDS;
  return [
    `${header}.${cut ? ` First ${PREVIEW_WORDS} words:` : " Full text:"}`,
    opening,
    ...(cut ? ["To find a specific part, call drive_read_file again with a query."] : []),
  ].join("\n\n");
}

// The chunks closest in meaning to the query, best first.
async function rankByMeaning(chunks: Chunk[], query: string, limit: number): Promise<Chunk[]> {
  if (chunks.length <= limit) return chunks;
  const [queryEmbedding, ...chunkEmbeddings] = await embedTexts([
    query,
    ...chunks.map((chunk) => chunk.content),
  ]);
  return chunks
    .map((chunk, index) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunkEmbeddings[index]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function sectionLabel(chunk: Chunk, index: number): string {
  if (chunk.pageStart === null) return `[section ${index + 1}]`;
  return chunk.pageStart === chunk.pageEnd
    ? `[page ${chunk.pageStart}]`
    : `[pages ${chunk.pageStart}-${chunk.pageEnd}]`;
}
