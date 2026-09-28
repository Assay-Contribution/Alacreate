import { postAi } from "./client";

// Plain data so any page can ask for a summary, not just the timeline.
export type DayActivity = {
  date: string;
  notes: string[];
  files: string[];
  links: string[];
  // The AI's replies that day. Pass them through shortenAiReply to save tokens.
  aiReplies?: string[];
};

const cache = new Map<string, Promise<string | null>>();

export function summarizeDay({
  date,
  notes,
  files,
  links,
  aiReplies = [],
}: DayActivity): Promise<string | null> {
  if (notes.length === 0 && files.length === 0 && links.length === 0 && aiReplies.length === 0) {
    return Promise.resolve(null);
  }

  const payload = { notes, files, links, aiReplies };
  const key = `${date}:${JSON.stringify(payload)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const request = postAi<{ summary?: string }>("/api/summarize", payload).then(
    (data) => data?.summary || null,
  );

  cache.set(key, request);
  return request;
}
