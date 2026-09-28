import { supabaseClient } from "../../supabase";
import { postAi } from "./client";

type ProcessResult = { fileId?: string; status?: string; error?: string };

// How long the assistant waits for just-uploaded files to finish processing before it
// answers, so "here's a file, what does it say?" works in one message. Files that take
// longer are reported as still processing, and the AI asks the user to try again.
const UPLOAD_WAIT_MS = 7000;

// Processing requests that haven't finished yet.
const inFlight = new Set<Promise<boolean>>();

// Makes a just-uploaded file searchable by the AI (reads it, embeds it, stores the
// sections). Don't await it before updating the UI: processing takes a few seconds, or up
// to about a minute for very large PDFs. Resolves to true once the file is ready.
export function processUploadedFile(storagePath: string, size: number): Promise<boolean> {
  const request = postAi<ProcessResult>("/api/process-file", { path: storagePath, size }).then(
    (result) => {
      if (import.meta.env.DEV && result) {
        console.log(`[AI] processed ${storagePath}:`, result.status, result.error ?? "");
      }
      return result?.status === "ready";
    },
  );
  inFlight.add(request);
  void request.finally(() => inFlight.delete(request));
  return request;
}

// Waits until files still being processed are done, but no longer than UPLOAD_WAIT_MS.
// Returns immediately when nothing is processing.
export async function waitForUploads(): Promise<void> {
  if (inFlight.size === 0) return;
  if (import.meta.env.DEV) console.log(`[AI] waiting for ${inFlight.size} upload(s) to process…`);
  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise((resolve) => setTimeout(resolve, UPLOAD_WAIT_MS)),
  ]);
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
