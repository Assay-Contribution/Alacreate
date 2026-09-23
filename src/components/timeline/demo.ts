/*  Local, backend-free harness for eyeballing the timeline components in a browser.
    Not part of the app; not imported by any page. Delete once the real
    Supabase-backed integration (see timeline.ts) is wired into a page. */
import { renderDayEntry } from "./day_entry";
import { renderComposer } from "./inuputs";
import { renderTimeSelect } from "./time_select";
import { createEmptyDayEntry, type DayEntry } from "./types";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function atTime(daysAgo: number, hhmm: string): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const [hours, minutes] = hhmm.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const today = isoDaysAgo(0);

const mockEntries = new Map<string, DayEntry>([
  [
    isoDaysAgo(9),
    {
      ...createEmptyDayEntry(isoDaysAgo(9)),
      northStar: "Ship the timeline prototype.",
      nextSteps: [{ title: "Sketch component layout", minutes: 45 }],
      finalReport: "Landed the initial layout sketch.",
      links: [{ url: "https://vitejs.dev", addedAt: new Date().toISOString() }],
    },
  ],
  [
    isoDaysAgo(2),
    {
      ...createEmptyDayEntry(isoDaysAgo(2)),
      northStar: "Wire up Supabase reads.",
      morningReport: "Reviewing schema for contribution_reports.",
      notes: [
        { text: "Started reviewing the schema.", addedAt: atTime(2, "09:15") },
        { text: "Found the missing jsonb columns.", addedAt: atTime(2, "11:40") },
      ],
      files: [
        {
          name: "notes.pdf",
          url: "#",
          path: "demo/notes.pdf",
          size: 48213,
          addedAt: atTime(2, "10:05"),
        },
      ],
    },
  ],
  [today, createEmptyDayEntry(today)],
]);

const root = document.querySelector<HTMLDivElement>("#timelineDemoRoot");
if (root) {
  root.className = "timeline-root";

  const stickyHeader = document.createElement("div");
  stickyHeader.className = "timeline-sticky-header";
  stickyHeader.textContent = "Wednesday (Today)";

  const scrollArea = document.createElement("div");
  scrollArea.className = "timeline-scroll";
  const dayList = document.createElement("div");
  dayList.className = "timeline-days";
  scrollArea.append(dayList);

  const composerDock = document.createElement("div");
  composerDock.className = "timeline-composer-dock";

  const timeSelectDock = document.createElement("div");
  timeSelectDock.className = "timeline-time-select-dock";

  root.append(stickyHeader, scrollArea, composerDock, timeSelectDock);

  const dayElements = new Map<string, HTMLElement>();

  const renderDays = () => {
    const expandedDates = new Set(
      Array.from(dayElements.entries())
        .filter(([, el]) => el.classList.contains("is-expanded"))
        .map(([date]) => date),
    );
    dayList.innerHTML = "";
    dayElements.clear();
    Array.from(mockEntries.keys())
      .sort()
      .forEach((date) => {
        const entry = mockEntries.get(date)!;
        const element = renderDayEntry({
          entry,
          isEditable: date === today,
          isExpanded: expandedDates.has(date),
          onUploadFiles: async (uploadDate, files) => {
            const entryToUpdate = mockEntries.get(uploadDate)!;
            entryToUpdate.files = [
              ...entryToUpdate.files,
              ...Array.from(files).map((file) => ({
                name: file.name,
                url: "#",
                path: `demo/${file.name}`,
                size: file.size,
                addedAt: new Date().toISOString(),
              })),
            ];
            renderDays();
          },
          onDeleteFile: (deleteDate, file) => {
            const entryToUpdate = mockEntries.get(deleteDate)!;
            entryToUpdate.files = entryToUpdate.files.filter((f) => f.path !== file.path);
            renderDays();
          },
          onEditNote: (editDate, note, newText) => {
            const entryToUpdate = mockEntries.get(editDate)!;
            entryToUpdate.notes = entryToUpdate.notes.map((n) =>
              n.addedAt === note.addedAt ? { ...n, text: newText } : n,
            );
            renderDays();
          },
          onDeleteNote: (deleteDate, note) => {
            const entryToUpdate = mockEntries.get(deleteDate)!;
            entryToUpdate.notes = entryToUpdate.notes.filter((n) => n.addedAt !== note.addedAt);
            renderDays();
          },
        });
        dayList.append(element);
        dayElements.set(date, element);
      });
  };

  renderDays();

  const timeSelect = renderTimeSelect({
    container: timeSelectDock,
    dates: Array.from(mockEntries.keys()),
    onSelect: (date) => {
      dayElements.get(date)?.scrollIntoView({ behavior: "smooth", block: "start" });
      timeSelect.setActiveDate(date);
    },
  });
  timeSelect.setActiveDate(today);

  renderComposer({
    container: composerDock,
    onSubmit: ({ text, links, files }) => {
      const entry = mockEntries.get(today)!;
      const now = new Date().toISOString();
      if (text) entry.notes = [...entry.notes, { text, addedAt: now }];
      entry.links = [...entry.links, ...links.map((url) => ({ url, addedAt: now }))];
      entry.files = [
        ...entry.files,
        ...files.map((file) => ({
          name: file.name,
          url: "#",
          path: `demo/${file.name}`,
          size: file.size,
          addedAt: now,
        })),
      ];
      renderDays();
    },
  });

  scrollArea.scrollTop = scrollArea.scrollHeight;
}
