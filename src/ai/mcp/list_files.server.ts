/*  list_files tool: tells the AI which files the user uploaded on a day, each file's id
    and whether it can be searched with query_file, a peek at what each one says, and the
    conversation around each upload. Server-only.
    Supported previews for now: PDFs and text files. Images (screenshots) are listed
    without a preview. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPages, fileKind, words, type FileKind } from "../extract_text.server";

const STORAGE_BUCKET = "report-attachments";
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;
const PREVIEW_WORDS = 5;
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 300;

// Tool definition in the format OpenAI function calling expects.
export const LIST_FILES_TOOL = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "List the files the user uploaded on a given day, with each file's id, whether it " +
      "can be searched with query_file, a short preview of its contents, and the messages " +
      "sent within 10 minutes of the upload.",
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

// A file's row in the `files` table, if it has been processed for search.
export type FileRecordInfo = {
  id: string;
  status: "pending" | "processing" | "ready" | "unsupported" | "failed";
  error: string | null;
  chunkCount: number | null;
  // Text of the first stored section, so previews don't need to download the file.
  opening: string | null;
};

// Where list_files reads from. The Supabase version is below; tests can pass their own.
export type FileSource = {
  getDay(date: string): Promise<{ files: StoredFile[]; notes: StoredNote[] } | null>;
  // Looks up the `files` rows for these storage paths, keyed by path.
  getRecords(paths: string[]): Promise<Map<string, FileRecordInfo>>;
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
    async getRecords(paths) {
      const records = new Map<string, FileRecordInfo>();
      if (paths.length === 0) return records;
      const { data: rows } = await db
        .from("files")
        .select("id, path, status, error, chunk_count")
        .in("path", paths);
      if (!rows || rows.length === 0) return records;

      const { data: openings } = await db
        .from("file_chunks")
        .select("file_id, content")
        .in("file_id", rows.map((row) => row.id))
        .eq("chunk_index", 0);
      const openingByFile = new Map((openings ?? []).map((row) => [row.file_id, row.content]));

      rows.forEach((row) =>
        records.set(row.path, {
          id: row.id,
          status: row.status,
          error: row.error,
          chunkCount: row.chunk_count,
          opening: openingByFile.get(row.id) ?? null,
        }),
      );
      return records;
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
  const records = await source.getRecords(files.map((file) => file.path));
  const sections = await Promise.all(
    files.map(async (file) => {
      const kind = fileKind(file.name);
      const record = records.get(file.path);
      const lines = [
        `[${record?.id ?? "no id yet"}] ${file.name} · ${kindLabel(kind)} · ` +
          `${sizeLabel(file.size)} · ${clockTime(file.addedAt, timeZone)}`,
        `  Search: ${searchStatus(record)}`,
      ];

      const preview = record?.opening
        ? `"${words(record.opening).slice(0, PREVIEW_WORDS).join(" ")}…"`
        : await previewFile(source, file, kind);
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
    "To search a file's contents, call query_file with its id (the part in brackets).",
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
    // Reads pages only until there are enough words, so large PDFs stay cheap.
    const pages = await extractPages(bytes, kind, {
      stopWhen: (read) => words(read.join(" ")).length >= PREVIEW_WORDS,
    });
    const opening = words(pages.join(" ")).slice(0, PREVIEW_WORDS);
    if (opening.length === 0) {
      return kind === "pdf" ? "(no readable text; it may be a scanned image)" : "(empty file)";
    }
    return `"${opening.join(" ")}…"`;
  } catch {
    return "(could not be read)";
  }
}

function searchStatus(record: FileRecordInfo | undefined): string {
  if (!record) {
    return "can't be searched: it has never been processed (uploads aren't processed " +
      "automatically yet), so waiting won't help";
  }
  switch (record.status) {
    case "ready":
      return `ready (${record.chunkCount} sections), use query_file`;
    case "pending":
    case "processing":
      return "being processed, try again in a minute";
    default:
      return `can't be searched: ${record.error ?? record.status}`;
  }
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
