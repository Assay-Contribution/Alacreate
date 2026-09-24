import { supabaseClient } from "../../supabase";
import { postAi } from "./client";

type ProcessResult = { fileId?: string; status?: string; error?: string };

// Makes a just-uploaded file searchable by the AI (reads it, embeds it, stores the
// sections). Don't await it before updating the UI: processing takes a few seconds, or up
// to about a minute for very large PDFs. Resolves to true once the file is ready.
export async function processUploadedFile(storagePath: string, size: number): Promise<boolean> {
  const result = await postAi<ProcessResult>("/api/process-file", { path: storagePath, size });
  if (import.meta.env.DEV && result) {
    console.log(`[AI] processed ${storagePath}:`, result.status, result.error ?? "");
  }
  return result?.status === "ready";
}

// Which of these files have finished processing and can be searched by the AI (the same
// `files.status` that list_files reports). Returns their storage paths.
export async function getReadyFiles(storagePaths: string[]): Promise<Set<string>> {
  if (!supabaseClient || storagePaths.length === 0) return new Set();
  const { data, error } = await supabaseClient
    .from("files")
    .select("path")
    .eq("status", "ready")
    .in("path", storagePaths);
  if (error) console.warn("[ai] couldn't load file search status", error.message);
  return new Set((data ?? []).map((row) => row.path as string));
}

// Removes a file from AI search. Deleting its `files` row makes the database delete all of
// the file's sections and embeddings too (on delete cascade in schema_file_vectors.sql).
// Runs as the signed-in user, so Row Level Security only lets people remove their own
// files. Files that were never processed have no row, which is fine.
export async function deleteFileFromSearch(storagePath: string): Promise<boolean> {
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.from("files").delete().eq("path", storagePath);
  if (error) {
    console.warn("[ai] couldn't remove file from search", storagePath, error.message);
    return false;
  }
  return true;
}
