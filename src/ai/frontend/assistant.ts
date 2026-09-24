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

  const data = await postAi<{ reply?: string | null }>("/api/assistant", {
    messages: recent.map((message) => ({
      role: message.author === "assistant" ? "assistant" : "user",
      text: message.text,
    })),
  });
  return data?.reply || null;
}
