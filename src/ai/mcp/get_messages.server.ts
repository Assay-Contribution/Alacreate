/*  get_messages tool: returns everything said on one day, in order: the user's notes and
    the AI's replies, with times. The AI's replies can be shortened to their first two
    lines to save tokens. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortenAiReply } from "../shorten_ai_reply";

// Safety limit so an unusually long day can't flood the AI (~12,000 tokens at ~4
// characters per token). Normal days are far below this.
const MAX_CHARS = 48_000;

// Tool definition in the format OpenAI function calling expects.
export const GET_MESSAGES_TOOL = {
  type: "function",
  function: {
    name: "get_messages",
    description:
      "Get everything said on one day, in order: the user's notes and your own replies, " +
      "with times. Your replies are included in full unless full_ai_replies is false, which " +
      "cuts each one to its first two lines to save tokens.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "The day to read, formatted YYYY-MM-DD." },
        full_ai_replies: {
          type: "boolean",
          description:
            "Include your own replies in full (default true). Set false to get just the " +
            "first two lines of each, when you only need the user's side of the day.",
        },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
} as const;

type StoredNote = { text: string; addedAt: string; author?: "assistant" };

// Where get_messages reads from. The Supabase version is below; tests can pass their own.
export type MessageSource = {
  getNotes(date: string): Promise<StoredNote[] | null>;
};

export type GetMessagesOptions = {
  date: string;
  fullAiReplies?: boolean;
  // The user's IANA time zone (e.g. "America/Denver"), for the times shown.
  timeZone?: string;
};

// `db` must be a Supabase client created with the signed-in user's token, so Row Level
// Security limits the results to that user's own messages.
export function supabaseMessageSource(db: SupabaseClient): MessageSource {
  return {
    async getNotes(date) {
      const { data, error } = await db
        .from("contribution_reports")
        .select("notes")
        .eq("report_date", date)
        .maybeSingle();
      if (error || !data) return null;
      return data.notes ?? [];
    },
  };
}

export async function getMessages(
  source: MessageSource,
  options: GetMessagesOptions,
): Promise<string> {
  const { date, timeZone = "UTC", fullAiReplies = true } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `"${date}" is not a valid date. Use the format YYYY-MM-DD, for example 2026-09-21.`;
  }

  const notes = await source.getNotes(date);
  if (!notes || notes.length === 0) return `No messages were written on ${date}.`;
  const ordered = [...notes].sort(
    (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
  );

  // Normally everything fits. If not, keep the newest messages within the safety limit.
  const lines: string[] = [];
  let shortened = 0;
  let budget = MAX_CHARS;
  for (let index = ordered.length - 1; index >= 0; index--) {
    const note = ordered[index];
    let text = note.text.trim();
    if (note.author === "assistant" && !fullAiReplies) {
      const short = shortenAiReply(text);
      if (short !== text) {
        text = `${short} [shortened]`;
        shortened++;
      }
    }
    const who = note.author === "assistant" ? "AI" : "User";
    const line = `${clockTime(note.addedAt, timeZone)}  ${who}: ${text.replace(/\s+/g, " ")}`;
    if (line.length > budget && lines.length > 0) break;
    lines.unshift(line);
    budget -= line.length;
  }

  const hidden = ordered.length - lines.length;
  return [
    `${ordered.length} message${ordered.length === 1 ? "" : "s"} on ${date}:`,
    ...(hidden > 0
      ? [
          `(This day is very long, so only the last ${lines.length} are shown; ${hidden} ` +
            "earlier ones were left out.)",
        ]
      : []),
    lines.join("\n"),
    ...(shortened > 0
      ? [
          "Your replies marked [shortened] show only their first two lines. Call " +
            "get_messages with full_ai_replies true to read them in full.",
        ]
      : []),
  ].join("\n\n");
}

function clockTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}
