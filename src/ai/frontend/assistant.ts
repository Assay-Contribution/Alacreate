import { postAi } from "./client";

// A message in the conversation; replies from the AI are marked with author "assistant".
export type AssistantMessage = {
  text: string;
  author?: "assistant";
};

// How many of the most recent messages are sent as conversation context.
const CONTEXT_MESSAGES = 6;

// Sends the latest messages to the assistant. Resolves to a reply only when the newest
// message actually asks the AI for something; ordinary notes resolve to null.
export async function askAssistant(messages: AssistantMessage[]): Promise<string | null> {
  const recent = messages.slice(-CONTEXT_MESSAGES);
  if (recent.length === 0 || recent[recent.length - 1].author === "assistant") return null;

  const payload = recent.map((message) => ({
    role: message.author === "assistant" ? "assistant" : "user",
    text: message.text,
  }));
  const data = await postAi<{ reply?: string | null }>("/api/assistant", {
    messages: payload,
    // So the AI knows what "today" means for the user (e.g. when looking up files).
    today: new Date().toLocaleDateString("en-CA"),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const reply = data?.reply || null;

  // Dev only: show what the AI was given and what it decided, in the browser console.
  if (import.meta.env.DEV && data) {
    console.groupCollapsed(`[AI] ${reply ? "replied" : "stayed silent"}: "${payload[payload.length - 1].text}"`);
    console.log("Sent to the AI:", payload);
    console.log(reply ? `Reply: ${reply}` : "Decided the latest message wasn't addressed to it.");
    console.groupEnd();
  }
  return reply;
}
