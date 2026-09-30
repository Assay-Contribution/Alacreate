/*  Generates a daily or weekly report. Collection uses the fast model (CHAT_MODEL): each
    document the user uploaded in the period gets a short brief (what it's about, key points,
    whether the user likely wrote it). Writing uses the stronger model (REPORT_MODEL) with
    the period's messages and those briefs. A daily report is saved to that day's
    contribution_reports.final_report; a weekly report to weekly_reports
    (schema_weekly_reports.sql). Generating again replaces the saved report.

    POST /api/generate-report { startDate, endDate, timeZone } (the same date twice for a
    daily report) streams newline-delimited JSON events:
      { type: "progress", message }  what it's working on
      { type: "delta", text }         the report as it's written
      { type: "done", report, saved } the full report, and whether it was saved
      { type: "error", message }
    Everything runs as the signed-in user, so Row Level Security limits it to their data. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMessages } from "../mcp/get_messages.server.js";
import { bearerToken, createUserClient } from "../lib/supabase.server.js";
import {
  chat,
  CHAT_MODEL,
  REPORT_MODEL,
  streamChatWithTools,
} from "../lib/openai.server.js";
import { json, readJson } from "../lib/http.server.js";

// Sections of a document read for its brief: the opening, plus samples spread through
// the rest so long documents are represented without reading all of them.
const OPENING_SECTIONS = 3;
const SAMPLED_SECTIONS = 5;
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;
const BRIEF_MAX_TOKENS = 400;
const DAILY_REPORT_MAX_TOKENS = 1800;
const WEEKLY_REPORT_MAX_TOKENS = 2500;
const MAX_PERIOD_DAYS = 31;

const BRIEF_PROMPT =
  "You are gathering material for a daily work report. You'll get excerpts from a " +
  "document the user uploaded, plus the messages they wrote around the time of the " +
  "upload. Reply in exactly this format:\n" +
  "About: 2-3 sentences on what the document is.\n" +
  "Key points: up to 4 short bullets with the points most relevant to someone's work.\n" +
  "Authorship: likely the user's own / likely someone else's / unclear, followed by the " +
  "evidence (e.g. what they said when uploading it, or that it's a published work).\n" +
  "Only use what's in the excerpts and messages.";

const DAILY_REPORT_PROMPT =
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

const WEEKLY_REPORT_PROMPT =
  "You write a weekly work report from the user's notes for each day of the week, your " +
  "own earlier replies to them (marked AI), and briefs of documents they uploaded. Write " +
  "Markdown with these sections, leaving out any that would be empty:\n" +
  "# <the Title line from the material, exactly>\n" +
  "## Summary: 3-5 sentences on the week as a whole.\n" +
  "## Highlights: the most significant things accomplished, as bullets.\n" +
  "## Day by day: one short bullet per day that had activity, starting with the day " +
  "(e.g. \"Monday: ...\"); skip days with nothing logged.\n" +
  "## Documents: one bullet per document: what it is, whether the user likely wrote it " +
  "(with the evidence), and how it relates to the week.\n" +
  "## Open items: things mentioned but not finished by the end of the week.\n" +
  "Rules: state only what the material supports and don't invent details. Only count " +
  "something as the user's work if their notes say they did it; things the AI wrote for " +
  "them (like a story) are requests, not their work. Write in a plain, direct past tense " +
  "without \"the user\". Keep it under 700 words.";

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
  | { type: "done"; report: string; saved: boolean }
  | { type: "error"; message: string };
type DayRow = { report_date: string; notes: Note[] | null; files: UploadedFile[] | null };

export async function handleGenerateReport(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);

  // Always requires a login, even in dev: the report is about someone's own day.
  const token = bearerToken(request);
  const userDb = createUserClient(request);
  if (!token || !userDb) return json({ error: "Unauthorized" }, 401);
  const { data: auth } = await userDb.auth.getUser(token);
  if (!auth.user) return json({ error: "Unauthorized" }, 401);

  const body = (await readJson(request)) as Record<string, unknown> | null;
  const startDate = isDate(body?.startDate) ? body.startDate : "";
  const endDate = isDate(body?.endDate) ? body.endDate : "";
  if (!startDate || !endDate || startDate > endDate) return json({ error: "Invalid dates" }, 400);
  if (daysBetween(startDate, endDate) >= MAX_PERIOD_DAYS) {
    return json({ error: `Reports cover at most ${MAX_PERIOD_DAYS} days` }, 400);
  }
  const timeZone = typeof body?.timeZone === "string" && isTimeZone(body.timeZone) ? body.timeZone : "UTC";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReportEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await generateReport(userDb, auth.user.id, startDate, endDate, timeZone, send);
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
  userId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
  send: (event: ReportEvent) => void,
): Promise<void> {
  const daily = startDate === endDate;
  send({ type: "progress", message: daily ? "Gathering the day's messages…" : "Gathering the week's messages…" });
  const { data } = await db
    .from("contribution_reports")
    .select("report_date, notes, files")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date");
  const days = (data ?? []) as DayRow[];
  const notesByDate = new Map(days.map((day) => [day.report_date, day.notes ?? []]));
  const uploads = days.flatMap((day) =>
    (day.files ?? []).map((file) => ({ ...file, date: day.report_date })),
  );
  if (days.every((day) => !day.notes?.length) && uploads.length === 0) {
    send({
      type: "error",
      message: `Nothing was logged ${daily ? "on this day" : "this week"}, so there's nothing to report.`,
    });
    return;
  }

  // The AI's own replies are shortened to two lines: the report is about the user's work.
  const source = { getNotes: async (date: string) => notesByDate.get(date) ?? null };
  const messages: string[] = [];
  for (const day of days) {
    if (!day.notes?.length) continue;
    messages.push(await getMessages(source, { date: day.report_date, fullAiReplies: false, timeZone }));
  }

  const { data: rows } = await db
    .from("files")
    .select("id, name, path, status, error, chunk_count, page_count")
    .gte("report_date", startDate)
    .lte("report_date", endDate);
  const fileRows = new Map(((rows ?? []) as FileRow[]).map((row) => [row.path, row]));

  const briefs: string[] = [];
  for (const upload of uploads) {
    const row = fileRows.get(upload.path);
    if (row?.status !== "ready") {
      briefs.push(
        `Document: ${upload.name} (uploaded ${upload.date})\nNot readable (${row?.error ?? "it hasn't been processed"}); only the name is known.`,
      );
      continue;
    }
    send({ type: "progress", message: `Reading ${upload.name}…` });
    const context = nearbyMessages(notesByDate.get(upload.date) ?? [], upload.addedAt, timeZone);
    briefs.push(`${await briefDocument(db, row, context)}\nUploaded: ${upload.date}`);
  }

  send({ type: "progress", message: "Writing the report…" });
  const title = daily
    ? `Daily report: ${longDate(startDate)}`
    : `Weekly report: ${shortDate(startDate)} – ${shortDate(endDate)}`;
  const material = [
    `Title: ${title}`,
    `Messages (times are ${timeZone}):\n\n${messages.join("\n\n") || "No messages were written."}`,
    briefs.length ? `Documents uploaded:\n\n${briefs.join("\n\n")}` : "No documents were uploaded.",
  ].join("\n\n");

  let report = "";
  for await (const text of streamChatWithTools(
    [
      { role: "system", content: daily ? DAILY_REPORT_PROMPT : WEEKLY_REPORT_PROMPT },
      { role: "user", content: material },
    ],
    [],
    async () => "",
    daily ? DAILY_REPORT_MAX_TOKENS : WEEKLY_REPORT_MAX_TOKENS,
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

  // Save it, replacing any earlier report for the same day or week.
  const { error } = daily
    ? await db.from("contribution_reports").update({ final_report: report }).eq("report_date", startDate)
    : await db.from("weekly_reports").upsert(
        {
          user_id: userId,
          week_start: startDate,
          week_end: endDate,
          report,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" },
      );
  if (error) console.error("[generate_report] couldn't save report", error);
  send({ type: "done", report, saved: !error });
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

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
