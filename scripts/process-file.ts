/*  Dev tool: makes one already-uploaded file searchable, then optionally searches it.
    Until uploads create `files` rows and trigger processing automatically, this is how
    to try processFile on real data.

    Usage:
      npm run process-file                          list uploaded files
      npm run process-file -- ECE3640               process the file whose name contains "ECE3640"
      npm run process-file -- ECE3640 "question"   process it (if needed), then search it

    Uses the service role key from .env.local, so it can see every user's files. */
import { embedTexts } from "../src/ai/embeddings.server";
import {
  createAdminClient,
  processFile,
  supabaseProcessStore,
  type FileRecord,
} from "../src/ai/process_file.server";

type UploadedFile = { name: string; path: string; size: number };

const [nameFilter, question] = process.argv.slice(2);
const db = createAdminClient();

const { data: days, error } = await db
  .from("contribution_reports")
  .select("user_id, report_date, files");
if (error) throw new Error(`Couldn't read uploads: ${error.message}`);

const uploads = days.flatMap((day) =>
  ((day.files ?? []) as UploadedFile[]).map((file) => ({
    ...file,
    userId: day.user_id as string,
    date: day.report_date as string,
  })),
);

if (!nameFilter) {
  console.log(`Uploaded files (${uploads.length}):`);
  uploads.forEach((file) => console.log(`  ${file.date}  ${file.name}  ${megabytes(file.size)}`));
  console.log('\nRun: npm run process-file -- <part of a file name> ["optional question"]');
  process.exit(0);
}

const upload = uploads.find((file) => file.name.toLowerCase().includes(nameFilter.toLowerCase()));
if (!upload) throw new Error(`No uploaded file name contains "${nameFilter}".`);

// Create (or reuse) the file's row in the `files` table.
const { data: row, error: upsertError } = await db
  .from("files")
  .upsert(
    {
      user_id: upload.userId,
      report_date: upload.date,
      name: upload.name,
      path: upload.path,
      size: upload.size,
    },
    { onConflict: "path" },
  )
  .select("id, user_id, name, path, size, status, chunk_count")
  .single();
if (upsertError) throw new Error(`Couldn't create the files row: ${upsertError.message}`);
const file = row as FileRecord & { status: string; chunk_count: number | null };

console.log(`File: ${file.name} (${megabytes(file.size)})  id: ${file.id}`);

if (file.status === "ready" && question) {
  console.log(`Already processed (${file.chunk_count} sections), skipping to search.`);
} else {
  console.log("Processing… (downloading, reading text, embedding)");
  const started = Date.now();
  const result = await processFile(supabaseProcessStore(db), file);
  console.log(`Result after ${((Date.now() - started) / 1000).toFixed(1)}s:`, result);
  if (result.status !== "ready") process.exit(1);

  const { data: sample } = await db
    .from("file_chunks")
    .select("chunk_index, page_start, page_end, content")
    .eq("file_id", file.id)
    .order("chunk_index")
    .limit(3);
  console.log("\nFirst sections:");
  sample?.forEach((chunk) => console.log(`  #${chunk.chunk_index} ${pages(chunk)}  ${preview(chunk.content)}`));
}

if (question) {
  const [queryEmbedding] = await embedTexts([question]);
  const { data: matches, error: searchError } = await db.rpc("match_file_chunks", {
    query_embedding: queryEmbedding,
    query_text: question,
    match_count: 5,
    filter_file_id: file.id,
  });
  if (searchError) throw new Error(`Search failed: ${searchError.message}`);
  console.log(`\nTop matches for "${question}":`);
  matches.forEach((match: { page_start: number; page_end: number; content: string; score: number }) =>
    console.log(`  ${pages(match)}  score ${match.score.toFixed(4)}  ${preview(match.content)}`),
  );
}

function pages(chunk: { page_start: number | null; page_end: number | null }): string {
  if (chunk.page_start === null) return "";
  return chunk.page_start === chunk.page_end
    ? `p. ${chunk.page_start}`
    : `pp. ${chunk.page_start}-${chunk.page_end}`;
}

function preview(text: string): string {
  return `"${text.slice(0, 110)}…"`;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
