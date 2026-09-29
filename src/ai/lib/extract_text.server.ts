/*  Turns a file into text, page by page, and splits text into chunks for embedding.
    Shared by list_files (previews), process_file (embedding uploads), and drive_read_file.
    Supported for now: PDFs and plain-text files. */
import { getDocumentProxy } from "unpdf";

export type FileKind = "pdf" | "text" | "image" | "other";

// About half a page per chunk, overlapping so sentences at the edges aren't lost.
const CHUNK_WORDS = 400;
const CHUNK_OVERLAP_WORDS = 50;

const TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "log"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

export function fileKind(name: string): FileKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "pdf";
  if (TEXT_EXTENSIONS.includes(extension)) return "text";
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  return "other";
}

export type ExtractOptions = {
  // Stop early once enough text has been read (e.g. a preview only needs the opening words).
  stopWhen?: (pages: string[]) => boolean;
};

// Returns one string per page. A text file counts as a single page. Throws if the file
// can't be parsed; returns [] for kinds that have no text (images, unsupported types).
export async function extractPages(
  bytes: Uint8Array,
  kind: FileKind,
  { stopWhen }: ExtractOptions = {},
): Promise<string[]> {
  if (kind === "text") return [normalize(new TextDecoder().decode(bytes))];
  if (kind !== "pdf") return [];

  const pdf = await getDocumentProxy(bytes);
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    pages.push(normalize(content.items.map((item) => ("str" in item ? item.str : "")).join(" ")));
    if (stopWhen?.(pages)) break;
  }
  return pages;
}

// Words that contain a letter or number, so bullets and dashes don't count as words.
export function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
}

export type Chunk = { content: string; pageStart: number | null; pageEnd: number | null };

// Splits pages into overlapping chunks of about CHUNK_WORDS words, remembering which
// pages each chunk came from so the AI can cite them.
export function chunkPages(pages: string[], hasPageNumbers: boolean): Chunk[] {
  const tagged = pages.flatMap((page, index) =>
    words(page).map((word) => ({ word, page: index + 1 })),
  );

  const chunks: Chunk[] = [];
  const step = CHUNK_WORDS - CHUNK_OVERLAP_WORDS;
  for (let start = 0; start < tagged.length; start += step) {
    const slice = tagged.slice(start, start + CHUNK_WORDS);
    chunks.push({
      content: slice.map((item) => item.word).join(" "),
      pageStart: hasPageNumbers ? slice[0].page : null,
      pageEnd: hasPageNumbers ? slice[slice.length - 1].page : null,
    });
    if (start + CHUNK_WORDS >= tagged.length) break;
  }
  return chunks;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
