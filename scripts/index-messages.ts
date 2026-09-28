/*  One-time catch-up: makes every existing timeline message searchable by the AI
    (query_history). New messages are indexed automatically as they're posted;
    run this after creating the message_chunks table (schema_message_vectors.sql). Safe to
    run again: already-indexed messages are simply updated.

    Usage: npm run index-messages

    Uses the service role key from .env.local, so it indexes every user's messages. */
import { indexMessages, type MessageToIndex } from "../src/ai/index_messages.server";
import { createAdminClient } from "../src/ai/process_file.server";

const BATCH_SIZE = 50;
const db = createAdminClient();

const { data: days, error } = await db
  .from("contribution_reports")
  .select("user_id, report_date, notes")
  .order("report_date");
if (error) throw new Error(`Couldn't read messages: ${error.message}`);

let total = 0;
for (const day of days) {
  const notes = ((day.notes ?? []) as MessageToIndex[]).filter((note) => note.text?.trim());
  for (let start = 0; start < notes.length; start += BATCH_SIZE) {
    total += await indexMessages(db, day.user_id, day.report_date, notes.slice(start, start + BATCH_SIZE));
  }
  if (notes.length) console.log(`  ${day.report_date}: ${notes.length} messages`);
}
console.log(`Indexed ${total} messages across ${days.length} days.`);
