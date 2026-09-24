/*  Server-side AI day summaries. Served at /api/summarize by api/summarize.ts on Vercel
    and by the Vite dev middleware (vite.config.ts) locally. */
import { chat, guardRequest, json, readJson, stringList, type HandlerOptions } from "./openai.server";

const MAX_PROMPT_LENGTH = 8000;

const SYSTEM_PROMPT =
  "You summarize one day's activity log into a single sentence of 5 to 14 words. " +
  "Be concrete about what was actually done. No quotation marks, no preamble, " +
  "respond with only the sentence.";

export async function handleSummarize(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const rejection = await guardRequest(request, options);
  if (rejection) return rejection;

  const prompt = buildPrompt(await readJson(request));
  if (!prompt) return json({ error: "Invalid request body" }, 400);

  const summary = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    40,
  );
  return summary ? json({ summary }) : json({ error: "Summary unavailable" }, 502);
}

function buildPrompt(body: unknown): string | null {
  const notes = stringList(body, "notes");
  const files = stringList(body, "files");
  const links = stringList(body, "links");
  if (!notes || !files || !links) return null;

  const lines = [
    ...notes.map((text) => `Note: ${text}`),
    ...files.map((name) => `File uploaded: ${name}`),
    ...links.map((url) => `Link shared: ${url}`),
  ];
  const prompt = lines.join("\n");
  if (lines.length === 0 || prompt.length > MAX_PROMPT_LENGTH) return null;
  return prompt;
}
