/*  Makes an uploaded file searchable by the AI: reads its text, splits it into sections
    ("chunks"), embeds each section with OpenAI, and stores everything in the
    file_chunks table (schema_file_vectors.sql). Runs in the background after upload, with
    no signed-in user, so it uses Supabase's service role key. Never use that key in the
    AI's tools (src/ai/mcp/); they must go through the user's own token. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./embeddings.server";
import { extractPages, fileKind, words } from "./extract_text.server";
import {
  bearerToken,
  createUserClient,
  isShortString,
  json,
  readJson,
  type HandlerOptions,
} from "./openai.server";

const STORAGE_BUCKET = "report-attachments";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
// About half a page per chunk, overlapping so sentences at the edges aren't lost.
const CHUNK_WORDS = 400;
const CHUNK_OVERLAP_WORDS = 50;
// Caps embedding cost for huge files (~1,000+ pages).
const MAX_CHUNKS = 2000;
const INSERT_BATCH_SIZE = 50;

// A row from the `files` table.
export type FileRecord = {
  id: string;
  user_id: string;
  name: string;
  path: string;
  size: number;
};

export type ChunkRow = {
  file_id: string;
  user_id: string;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  content: string;
  embedding: number[];
};

type FileUpdate = {
  status: "processing" | "ready" | "unsupported" | "failed";
  error?: string | null;
  page_count?: number | null;
  chunk_count?: number | null;
  processed_at?: string | null;
};

// Where processFile reads and writes. The Supabase version is below; tests can pass their own.
export type ProcessStore = {
  download(path: string): Promise<Uint8Array | null>;
  updateFile(fileId: string, update: FileUpdate): Promise<void>;
  // Replaces all of a file's chunks, so processing the same file twice is safe.
  replaceChunks(fileId: string, rows: ChunkRow[]): Promise<void>;
};

export type ProcessResult =
  | { status: "ready"; pageCount: number; chunkCount: number }
  | { status: "unsupported" | "failed"; error: string };

// Server-only Supabase client that bypasses Row Level Security. Only for processing.
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export function supabaseProcessStore(db: SupabaseClient): ProcessStore {
  return {
    async download(path) {
      const { data } = await db.storage.from(STORAGE_BUCKET).download(path);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
    async updateFile(fileId, update) {
      const { error } = await db.from("files").update(update).eq("id", fileId);
      if (error) throw new Error(`Couldn't update file ${fileId}: ${error.message}`);
    },
    async replaceChunks(fileId, rows) {
      const { error: deleteError } = await db.from("file_chunks").delete().eq("file_id", fileId);
      if (deleteError) throw new Error(`Couldn't clear old chunks: ${deleteError.message}`);
      for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
        const { error } = await db
          .from("file_chunks")
          .insert(rows.slice(start, start + INSERT_BATCH_SIZE));
        if (error) throw new Error(`Couldn't save chunks: ${error.message}`);
      }
    },
  };
}

// Pass `bytes` if you already have the file's contents; otherwise it's downloaded.
export async function processFile(
  store: ProcessStore,
  file: FileRecord,
  bytes?: Uint8Array,
): Promise<ProcessResult> {
  const kind = fileKind(file.name);
  if (kind === "image" || kind === "other") {
    const error =
      kind === "image"
        ? "Images aren't searchable yet."
        : "This file type isn't searchable yet. Supported: PDF and text files.";
    await store.updateFile(file.id, { status: "unsupported", error });
    return { status: "unsupported", error };
  }

  const fail = async (error: string): Promise<ProcessResult> => {
    await store.updateFile(file.id, { status: "failed", error });
    return { status: "failed", error };
  };

  if (file.size > MAX_FILE_BYTES) return fail("File is too large to process (limit 50 MB).");

  try {
    await store.updateFile(file.id, { status: "processing", error: null });

    const contents = bytes ?? (await store.download(file.path));
    if (!contents) return fail("The file couldn't be downloaded from storage.");
    if (contents.byteLength > MAX_FILE_BYTES) {
      return fail("File is too large to process (limit 50 MB).");
    }

    const pages = await extractPages(contents, kind);
    const chunks = chunkPages(pages, kind === "pdf");
    if (chunks.length === 0) {
      return fail(
        kind === "pdf" ? "No readable text; it may be a scanned PDF." : "The file is empty.",
      );
    }
    if (chunks.length > MAX_CHUNKS) {
      return fail(`File is too long to process (${chunks.length} sections, limit ${MAX_CHUNKS}).`);
    }

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
    await store.replaceChunks(
      file.id,
      chunks.map((chunk, index) => ({
        file_id: file.id,
        user_id: file.user_id,
        chunk_index: index,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        content: chunk.content,
        embedding: embeddings[index],
      })),
    );

    await store.updateFile(file.id, {
      status: "ready",
      error: null,
      page_count: kind === "pdf" ? pages.length : null,
      chunk_count: chunks.length,
      processed_at: new Date().toISOString(),
    });
    return { status: "ready", pageCount: pages.length, chunkCount: chunks.length };
  } catch (error) {
    console.error("[process_file]", file.id, error);
    return fail(error instanceof Error ? error.message : "Processing failed.");
  }
}

// POST /api/process-file { path }: called by the browser right after an upload. Records
// the file in `files` as the signed-in user, then makes it searchable. Served by
// api/process-file.ts on Vercel and by the Vite dev middleware locally.
export async function handleProcessUpload(
  request: Request,
  _options: HandlerOptions = {},
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);

  // Always requires a login, even in dev: the file has to belong to someone.
  const token = bearerToken(request);
  const userDb = createUserClient(request);
  if (!token || !userDb) return json({ error: "Unauthorized" }, 401);
  const { data: auth } = await userDb.auth.getUser(token);
  if (!auth.user) return json({ error: "Unauthorized" }, 401);

  const body = (await readJson(request)) as { path?: unknown; size?: unknown } | null;
  const upload = isShortString(body?.path) ? parseUploadPath(body.path, auth.user.id) : null;
  if (!upload) return json({ error: "Invalid file path" }, 400);

  // Inserted as the user, so RLS guarantees the row is theirs.
  const record = await recordUpload(userDb, {
    ...upload,
    size: typeof body?.size === "number" ? body.size : 0,
  });
  if (!record) return json({ error: "Couldn't record the file" }, 500);
  if (record.status === "ready") return json({ fileId: record.id, status: "ready" });

  const result = await processFile(supabaseProcessStore(createAdminClient()), record);
  return json({ fileId: record.id, ...result });
}

// Upload paths look like "<user id>/<YYYY-MM-DD>/<timestamp>-<file name>". Only paths in
// the signed-in user's own folder are accepted.
function parseUploadPath(
  path: string,
  userId: string,
): { path: string; reportDate: string; name: string } | null {
  const match = path.match(/^([^/]+)\/(\d{4}-\d{2}-\d{2})\/\d+-(.+)$/);
  if (!match || match[1] !== userId || match[3].includes("/")) return null;
  return { path, reportDate: match[2], name: match[3] };
}

async function recordUpload(
  userDb: SupabaseClient,
  upload: { path: string; reportDate: string; name: string; size: number },
): Promise<(FileRecord & { status: string }) | null> {
  const columns = "id, user_id, name, path, size, status";
  const { data, error } = await userDb
    .from("files")
    .insert({
      report_date: upload.reportDate,
      name: upload.name,
      path: upload.path,
      size: upload.size,
    })
    .select(columns)
    .single();
  if (data) return data;

  // Already recorded (e.g. a retry): reuse the existing row.
  if (error?.code === "23505") {
    const { data: existing } = await userDb
      .from("files")
      .select(columns)
      .eq("path", upload.path)
      .maybeSingle();
    return existing;
  }
  console.error("[process_file] couldn't record upload", error);
  return null;
}

type Chunk = { content: string; pageStart: number | null; pageEnd: number | null };

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
