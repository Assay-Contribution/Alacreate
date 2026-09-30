// Small helpers for working with a day's timeline data (see types/timeline.ts).
import type { DayEntry, NoteEntry } from "../types/timeline";

export function userNotes(notes: NoteEntry[]): NoteEntry[] {
  return notes.filter((note) => note.author !== "assistant");
}

export function createEmptyDayEntry(date: string): DayEntry {
  return {
    date,
    finalReport: null,
    links: [],
    files: [],
    notes: [],
  };
}
