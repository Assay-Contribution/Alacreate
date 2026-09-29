// Data types for a day on the timeline: its notes, files, links, and final report.
export type LinkAttachment = {
  url: string;
  addedAt: string;
};

export type FileAttachment = {
  name: string;
  url: string;
  path: string;
  size: number;
  addedAt: string;
};

export type NoteEntry = {
  text: string;
  addedAt: string;
  // Replies from the AI assistant are stored alongside notes; user notes omit this.
  author?: "assistant";
};

export type DayEntry = {
  date: string;
  finalReport: string | null;
  links: LinkAttachment[];
  files: FileAttachment[];
  notes: NoteEntry[];
};
