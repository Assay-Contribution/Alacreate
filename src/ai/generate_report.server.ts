/*  Generates a day's report. Collection uses the fast model (CHAT_MODEL): each document the
    user uploaded that day gets a short brief (what it's about, key points, whether the user
    likely wrote it). Writing uses the stronger model (REPORT_MODEL) with the day's messages
    and those briefs. The finished report is saved to contribution_reports.final_report.

    POST /api/generate-report { date, timeZone } streams newline-delimited JSON events:
      { type: "progress", message }  what it's working on
      { type: "delta", text }         the report as it's written
      { type: "done", report }        the full report (also saved)
      { type: "error", message }
    Everything runs as the signed-in user, so Row Level Security limits it to their data. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMessages, supabaseMessageSource } from "./mcp/get_messages.server";
import {
  bearerToken,
  chat,
  CHAT_MODEL,
  createUserClient,
  json,
  readJson,
  REPORT_MODEL,
  streamChatWithTools,
} from "./openai.server";

// Sections of a document read for its brief: the opening, plus samples spread through
// the rest so long documents are represented without reading all of them.
const OPENING_SECTIONS = 3;
const SAMPLED_SECTIONS = 5;
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;
const BRIEF_MAX_TOKENS = 400;
const REPORT_MAX_TOKENS = 1800;

const BRIEF_PROMPT =
  "You are gathering material for a daily work report. You'll get excerpts from a " +
  "document the user uploaded, plus the messages they wrote around the time of the " +
  "upload. Reply in exactly this format:\n" +
  "About: 2-3 sentences on what the document is.\n" +
  "Key points: up to 4 short bullets with the points most relevant to someone's work.\n" +
  "Authorship: likely the user's own / likely someone else's / unclear, followed by the " +
  "evidence (e.g. what they said when uploading it, or that it's a published work).\n" +
  "Only use what's in the excerpts and messages.";

const REPORT_PROMPT =
  "You write a daily work report from the user's notes for the day, your own earlier " +
  "replies to them (marked AI), and briefs of documents they uploaded. Write Markdown " +
  "with these sections, leaving out any that would be empty:\n" +
  "# <the Title line from the material, exactly>\n" +
  "## Summary: 2-4 sentences.\n" +
  "## What was done: concrete bullets, with times where helpful.\n" +
  "## Documents: one bullet per document: what it is, whether the user likely wrote it " +
  "(with the evidence), and how it relates to the day.\n" +
  "## Timeline: key moments with times.\n" +
  "## Open items: things mentioned but not finished.\n" +
  "Rules: state only what the material supports and don't invent details. Only count " +
  "something as the user's work if their notes say they did it; things the AI wrote for " +
  "them (like a story) are requests, not their work. Write in a plain, direct past tense " +
  "without \"the user\" (e.g. \"Reviewed the schema.\"). Keep it under 500 words.";

type Note = { text: string; addedAt: string; author?: "assistant" };
type UploadedFile = { name: string; path: string; addedAt: string };
type FileRow = {
  id: string;
  name: string;
  path: string;
  status: string;
  error: string | null;
  chunk_count: number | null;
  page_count: number | null;
};
type ReportEvent =
  | { type: "progress"; message: string }
  | { type: "delta"; text: string }
  | { type: "done"; report: string }
  | { type: "error"; message: string };

export async function handleGenerateReport(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);

  // Always requires a login, even in dev: the report is about someone's own day.
  const token = bearerToken(request);
  const userDb = createUserClient(request);
  if (!token || !userDb) return json({ error: "Unauthorized" }, 401);
  const { data: auth } = await userDb.auth.getUser(token);
  if (!auth.user) return json({ error: "Unauthorized" }, 401);

  const body = (await readJson(request)) as { date?: unknown; timeZone?: unknown } | null;
  const date = typeof body?.date === "string" ? body.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date" }, 400);
  const timeZone = typeof body?.timeZone === "string" && isTimeZone(body.timeZone) ? body.timeZone : "UTC";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReportEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await generateReport(userDb, date, timeZone, send);
      } catch (error) {
        console.error("[generate_report]", error);
        send({ type: "error", message: "Something went wrong while generating the report." });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function generateReport(
  db: SupabaseClient,
  date: string,
  timeZone: string,
  send: (event: ReportEvent) => void,
): Promise<void> {
  send({ type: "progress", message: "Gathering the day's messages…" });
  const { data: day } = await db
    .from("contribution_reports")
    .select("notes, files")
    .eq("report_date", date)
    .maybeSingle();
  const notes: Note[] = day?.notes ?? [];
  const uploads: UploadedFile[] = day?.files ?? [];
  if (notes.length === 0 && uploads.length === 0) {
    send({ type: "error", message: "Nothing was logged on this day, so there's nothing to report." });
    return;
  }

  // The AI's own replies are shortened to two lines: the report is about the user's work.
  const messages = notes.length
    ? await getMessages(supabaseMessageSource(db), { date, fullAiReplies: false, timeZone })
    : "No messages were written this day.";

  const { data: rows } = await db
    .from("files")
    .select("id, name, path, status, error, chunk_count, page_count")
    .eq("report_date", date);
  const fileRows = new Map(((rows ?? []) as FileRow[]).map((row) => [row.path, row]));

  const briefs: string[] = [];
  for (const upload of uploads) {
    const row = fileRows.get(upload.path);
    if (row?.status !== "ready") {
      briefs.push(
        `Document: ${upload.name}\nNot readable (${row?.error ?? "it hasn't been processed"}); only the name is known.`,
      );
      continue;
    }
    send({ type: "progress", message: `Reading ${upload.name}…` });
    briefs.push(await briefDocument(db, row, nearbyMessages(notes, upload.addedAt, timeZone)));
  }

  send({ type: "progress", message: "Writing the report…" });
  const material = [
    `Title: Daily report: ${longDate(date)}`,
    `Messages (times are ${timeZone}):\n${messages}`,
    briefs.length ? `Documents uploaded:\n\n${briefs.join("\n\n")}` : "No documents were uploaded.",
  ].join("\n\n");

  let report = "";
  for await (const text of streamChatWithTools(
    [
      { role: "system", content: REPORT_PROMPT },
      { role: "user", content: material },
    ],
    [],
    async () => "",
    REPORT_MAX_TOKENS,
    undefined,
    REPORT_MODEL,
  )) {
    report += text;
    send({ type: "delta", text });
  }
  report = report.trim();
  if (!report) {
    send({ type: "error", message: "The report couldn't be written. Try again." });
    return;
  }

  const { error } = await db.from("contribution_reports").update({ final_report: report }).eq("report_date", date);
  if (error) console.error("[generate_report] couldn't save report", error);
  send({ type: "done", report });
}

// Reads the opening of a processed document plus samples from the rest, and asks the fast
// model for a brief the report writer can use.
async function briefDocument(db: SupabaseClient, file: FileRow, uploadContext: string): Promise<string> {
  const indexes = sampleSections(file.chunk_count ?? 0);
  const { data: sections } = await db
    .from("file_chunks")
    .select("chunk_index, page_start, page_end, content")
    .eq("file_id", file.id)
    .in("chunk_index", indexes)
    .order("chunk_index");
  const excerpts = (sections ?? [])
    .map((section) => {
      const pages = section.page_start ? ` (pages ${section.page_start}-${section.page_end})` : "";
      return `[Section ${section.chunk_index + 1}${pages}]\n${section.content}`;
    })
    .join("\n\n");

  const length = file.page_count ? `${file.page_count} pages` : `${file.chunk_count} sections`;
  const brief = await chat(
    [
      { role: "system", content: BRIEF_PROMPT },
      {
        role: "user",
        content:
          `Document: ${file.name} (${length})\n\n` +
          `Messages around the upload:\n${uploadContext}\n\n` +
          `Excerpts:\n${excerpts}`,
      },
    ],
    BRIEF_MAX_TOKENS,
    CHAT_MODEL,
  );
  return `Document: ${file.name} (${length})\n${brief ?? "The brief couldn't be written; only the name is known."}`;
}

function sampleSections(count: number): number[] {
  if (count <= OPENING_SECTIONS + SAMPLED_SECTIONS) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const indexes = new Set(Array.from({ length: OPENING_SECTIONS }, (_, index) => index));
  const rest = count - OPENING_SECTIONS;
  for (let step = 1; step <= SAMPLED_SECTIONS; step++) {
    indexes.add(OPENING_SECTIONS + Math.floor((rest * step) / (SAMPLED_SECTIONS + 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

function nearbyMessages(notes: Note[], uploadedAt: string, timeZone: string): string {
  const uploadTime = new Date(uploadedAt).getTime();
  const nearby = notes.filter(
    (note) => Math.abs(new Date(note.addedAt).getTime() - uploadTime) <= CONTEXT_WINDOW_MS,
  );
  if (nearby.length === 0) return "(none)";
  return nearby
    .map((note) => {
      const time = new Date(note.addedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
      return `${time} ${note.author === "assistant" ? "AI" : "User"}: ${note.text.slice(0, 300)}`;
    })
    .join("\n");
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
