import type { DayEntry } from "./types";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT =
  "You summarize one day's activity log into a single sentence of 5 to 14 words. " +
  "Be concrete about what was actually done. No quotation marks, no preamble, " +
  "respond with only the sentence.";

const cache = new Map<string, Promise<string | null>>();

function entrySignature(entry: DayEntry): string {
  return JSON.stringify({
    notes: entry.notes.map((n) => n.text),
    files: entry.files.map((f) => f.name),
    links: entry.links.map((l) => l.url),
  });
}

function entryToPrompt(entry: DayEntry): string {
  const lines: string[] = [];
  entry.notes.forEach((note) => lines.push(`Note: ${note.text}`));
  entry.files.forEach((file) => lines.push(`File uploaded: ${file.name}`));
  entry.links.forEach((link) => lines.push(`Link shared: ${link.url}`));
  return lines.join("\n");
}

export function summarizeDay(entry: DayEntry): Promise<string | null> {
  if (!API_KEY) return Promise.resolve(null);
  if (entry.notes.length === 0 && entry.files.length === 0 && entry.links.length === 0) {
    return Promise.resolve(null);
  }

  const key = `${entry.date}:${entrySignature(entry)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const request = fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 40,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: entryToPrompt(entry) }],
    }),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const text = data?.content?.[0]?.text?.trim();
      return text || null;
    })
    .catch(() => null);

  cache.set(key, request);
  return request;
}
