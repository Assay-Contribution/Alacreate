import { supabaseClient } from "../../supabase";
import { postAi } from "./client";

// A timeline message: a note, or an AI reply (author "assistant").
export type SearchableMessage = { text: string; addedAt: string; author?: "assistant" };

// Makes messages searchable by the AI (query_history): the server embeds them
// with OpenAI and stores them. Call again after an edit to update the stored version.
// Returns right away; indexing finishes in the background.
export function indexMessagesForSearch(date: string, messages: SearchableMessage[]): void {
  if (messages.length === 0) return;
  void postAi("/api/index-messages", {
    date,
    messages: messages.map(({ text, addedAt, author }) => ({ text, addedAt, author })),
  });
}

// Removes a deleted message from AI search. Runs as the signed-in user, so Row Level
// Security only lets people remove their own messages.
export async function removeMessageFromSearch(message: SearchableMessage): Promise<void> {
  if (!supabaseClient) return;
  const { error } = await supabaseClient
    .from("message_chunks")
    .delete()
    .eq("added_at", message.addedAt)
    .eq("author", message.author === "assistant" ? "assistant" : "user");
  if (error) console.warn("[ai] couldn't remove message from search", error.message);
}
