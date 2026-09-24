/*  Turns an uploaded file into text, page by page. Shared by list_files (previews) and
    process_file (embedding). Supported for now: PDFs and plain-text files. */
import { getDocumentProxy } from "unpdf";

export type FileKind = "pdf" | "text" | "image" | "other";

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

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
