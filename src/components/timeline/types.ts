export type ReportTask = { title: string; minutes: number };

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
};

export type DayEntry = {
  date: string;
  northStar: string;
  nextSteps: ReportTask[];
  morningReport: string | null;
  middayReport: string | null;
  finalReport: string | null;
  links: LinkAttachment[];
  files: FileAttachment[];
  notes: NoteEntry[];
};

export function createEmptyDayEntry(date: string): DayEntry {
  return {
    date,
    northStar: "",
    nextSteps: [],
    morningReport: null,
    middayReport: null,
    finalReport: null,
    links: [],
    files: [],
    notes: [],
  };
}
