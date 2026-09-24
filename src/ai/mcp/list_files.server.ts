/*  list_files tool: tells the AI which files the user uploaded on a day, a peek at what
    each one says, and the conversation around each upload. Server-only.
    Supported previews for now: PDFs and text files. Images (screenshots) are listed
    without a preview. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";

const STORAGE_BUCKET = "report-attachments";
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;
const PREVIEW_WORDS = 5;
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 300;

const TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "log"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

// Tool definition in the format OpenAI function calling expects.
export const LIST_FILES_TOOL = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "List the files the user uploaded on a given day, with each file's id, a short " +
      "preview of its contents, and the messages sent within 10 minutes of the upload.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "The day to look at, formatted YYYY-MM-DD." },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
} as const;

type StoredFile = { name: string; path: string; size: number; addedAt: string };
type StoredNote = { text: string; addedAt: string; author?: "assistant" };

type FileKind = "pdf" | "text" | "image" | "other";

// Where list_files reads from. The Supabase version is below; tests can pass their own.
export type FileSource = {
  getDay(date: string): Promise<{ files: StoredFile[]; notes: StoredNote[] } | null>;
  download(path: string): Promise<Uint8Array | null>;
};

export type ListFilesOptions = {
  date: string;
  // The user's IANA time zone (e.g. "America/Denver") so times read naturally.
  timeZone?: string;
};

// `db` must be a Supabase client created with the signed-in user's token, so Row Level
// Security limits the results to that user's own day.
export function supabaseFileSource(db: SupabaseClient): FileSource {
  return {
    async getDay(date) {
      const { data, error } = await db
        .from("contribution_reports")
        .select("files, notes")
        .eq("report_date", date)
        .maybeSingle();
      if (error || !data) return null;
      return { files: data.files ?? [], notes: data.notes ?? [] };
    },
    async download(path) {
      const { data } = await db.storage.from(STORAGE_BUCKET).download(path);
      if (data) return new Uint8Array(await data.arrayBuffer());
      // The bucket is currently public with no read policy, so fall back to the public URL.
      const { data: publicUrl } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const response = await fetch(publicUrl.publicUrl);
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
  };
}

export async function listFiles(source: FileSource, options: ListFilesOptions): Promise<string> {
  const { date, timeZone = "UTC" } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `"${date}" is not a valid date. Use the format YYYY-MM-DD, for example 2026-09-21.`;
  }

  const day = await source.getDay(date);
  if (!day || day.files.length === 0) return `No files were uploaded on ${date}.`;

  const files = [...day.files].sort((a, b) => time(a.addedAt) - time(b.addedAt));
  const sections = await Promise.all(
    files.map(async (file) => {
      const kind = fileKind(file.name);
      const lines = [
        `[${file.path}] ${file.name} · ${kindLabel(kind)} · ${sizeLabel(file.size)} · ` +
          clockTime(file.addedAt, timeZone),
      ];

      const preview = await previewFile(source, file, kind);
      if (preview) lines.push(`  Starts with: ${preview}`);

      const nearby = day.notes
        .filter((note) => Math.abs(time(note.addedAt) - time(file.addedAt)) <= CONTEXT_WINDOW_MS)
        .sort((a, b) => time(a.addedAt) - time(b.addedAt));
      if (nearby.length === 0) {
        lines.push("  No messages within 10 minutes.");
      } else {
        lines.push("  Messages within 10 minutes:");
        nearby.forEach((note) => {
          const who = note.author === "assistant" ? "AI" : "User";
          const when = relativeTime(time(note.addedAt) - time(file.addedAt));
          lines.push(`    ${who} (${when}): "${truncate(note.text)}"`);
        });
      }
      return lines.join("\n");
    }),
  );

  return [
    `Files on ${date} (${files.length}):`,
    ...sections,
    "To read a file, call read_file with its id (the part in brackets).",
  ].join("\n\n");
}

async function previewFile(
  source: FileSource,
  file: StoredFile,
  kind: FileKind,
): Promise<string | null> {
  if (kind === "image") return null;
  if (kind === "other") return "(preview not supported for this file type yet)";
  if (file.size > MAX_PREVIEW_BYTES) return "(too large to preview)";

  const bytes = await source.download(file.path);
  if (!bytes) return "(could not be opened)";

  try {
    const text = kind === "pdf" ? await pdfOpeningText(bytes) : new TextDecoder().decode(bytes);
    const words = previewWords(text);
    if (words.length === 0) {
      return kind === "pdf" ? "(no readable text; it may be a scanned image)" : "(empty file)";
    }
    return `"${words.join(" ")}…"`;
  } catch {
    return "(could not be read)";
  }
}

// Reads pages only until there are enough words, so large PDFs stay cheap.
async function pdfOpeningText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  let text = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    text += " " + content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    if (previewWords(text).length >= PREVIEW_WORDS) break;
  }
  return text;
}

// Words that contain a letter or number, so bullets and dashes don't count toward the five.
function previewWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, PREVIEW_WORDS);
}

function fileKind(name: string): FileKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "pdf";
  if (TEXT_EXTENSIONS.includes(extension)) return "text";
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  return "other";
}

function kindLabel(kind: FileKind): string {
  return { pdf: "PDF", text: "text", image: "image", other: "other" }[kind];
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clockTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function relativeTime(diffMs: number): string {
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes === 0) return "same time";
  const unit = minutes === 1 ? "min" : "mins";
  return diffMs < 0 ? `${minutes} ${unit} before` : `${minutes} ${unit} after`;
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_MESSAGE_CHARS ? `${oneLine.slice(0, MAX_MESSAGE_CHARS)}…` : oneLine;
}

function time(iso: string): number {
  return new Date(iso).getTime();
}
