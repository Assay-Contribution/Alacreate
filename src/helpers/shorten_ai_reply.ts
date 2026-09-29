/*  Shared by the browser and the server (no .server suffix): shortens an AI reply to its
    first two lines, so tools and summaries can mention the AI's replies without spending
    tokens on the whole text. */

const MAX_LINES = 2;
// Many replies are one long paragraph, so "two lines" is also capped by length.
const MAX_CHARS = 200;

// Returns the reply unchanged if it's already short; otherwise its first two lines
// (at most MAX_CHARS characters) followed by "…".
export function shortenAiReply(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split("\n").filter((line) => line.trim());
  let short = lines.slice(0, MAX_LINES).join(" ");
  if (short.length > MAX_CHARS) short = short.slice(0, MAX_CHARS);
  return short.length < trimmed.replace(/\n+/g, " ").length ? `${short}…` : trimmed;
}
