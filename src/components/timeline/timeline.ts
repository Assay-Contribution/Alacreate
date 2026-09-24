/*
    import time_select from "./time_select";
    import day_entry from "./day_entry";
    import inuputs from "./inuputs";

    This is essentially a head compoennt that imports all of the other components and puts them in the appropriate places.
    The day_entry should go on the middle bottom, the time select should go on the middle right and should be on top of other the day_entries

    There should be many instances of day entry, the newest one should be at the bttom and the oldest at the top.
    This should be autoscroled to the bottom like a chat app. different days should be accesible by the html #.
    These different # should be selectable from the time_select component.
*/
import { supabaseClient } from "../../supabase";
import { askAssistant } from "../../ai/frontend/assistant";
import { renderDayEntry } from "./day_entry";
import { formatFullDayLabel, localIsoDate } from "./format";
import { renderComposer } from "./inuputs";
import { renderTimeSelect, type TimeSelectController } from "./time_select";
import { createEmptyDayEntry, type DayEntry, type FileAttachment, type NoteEntry } from "./types";

const STORAGE_BUCKET = "report-attachments";

export async function initTimeline(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  root.classList.add("timeline-root");

  const stickyHeader = document.createElement("div");
  stickyHeader.className = "timeline-sticky-header";

  const scrollArea = document.createElement("div");
  scrollArea.className = "timeline-scroll";

  const dayList = document.createElement("div");
  dayList.className = "timeline-days";
  scrollArea.append(dayList);

  const composerContainer = document.createElement("div");
  composerContainer.className = "timeline-composer-dock";

  const timeSelectContainer = document.createElement("div");
  timeSelectContainer.className = "timeline-time-select-dock";

  const errorBanner = document.createElement("div");
  errorBanner.className = "timeline-banner-error";
  errorBanner.hidden = true;

  root.append(stickyHeader, scrollArea, composerContainer, timeSelectContainer, errorBanner);

  let errorTimeout: number | undefined;
  const showError = (message: string) => {
    console.error("[timeline]", message);
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    window.clearTimeout(errorTimeout);
    errorTimeout = window.setTimeout(() => {
      errorBanner.hidden = true;
    }, 8000);
  };

  if (!supabaseClient) {
    dayList.innerHTML = `<p class="timeline-error">Timeline is not available right now.</p>`;
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    dayList.innerHTML = `<p class="timeline-error">Sign in to see your timeline.</p>`;
    return;
  }

  const entries = await loadEntries(userId);
  const today = localIsoDate();
  if (!entries.has(today)) entries.set(today, createEmptyDayEntry(today));

  const dayElements = new Map<string, HTMLElement>();
  const sortedDates = () => Array.from(entries.keys()).sort();

  const persistEntry = async (entry: DayEntry): Promise<boolean> => {
    entries.set(entry.date, entry);
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("contribution_reports").upsert(
      {
        user_id: userId,
        report_date: entry.date,
        north_star: entry.northStar,
        next_steps: entry.nextSteps,
        morning_report: entry.morningReport,
        midday_report: entry.middayReport,
        final_report: entry.finalReport,
        links: entry.links,
        files: entry.files,
        notes: entry.notes,
      },
      { onConflict: "user_id,report_date" },
    );
    if (error) {
      showError(`Couldn't save ${entry.date}: ${error.message}`);
      return false;
    }
    return true;
  };

  const uploadFiles = async (date: string, fileList: FileList): Promise<void> => {
    if (!supabaseClient) return;
    const entry = entries.get(date) ?? createEmptyDayEntry(date);
    const uploaded: FileAttachment[] = [];

    for (const file of Array.from(fileList)) {
      const path = `${userId}/${date}/${Date.now()}-${file.name}`;
      const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .upload(path, file);
      if (error) {
        showError(`Couldn't upload ${file.name}: ${error.message}`);
        continue;
      }
      const { data: publicUrl } = supabaseClient.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);
      uploaded.push({
        name: file.name,
        url: publicUrl.publicUrl,
        path,
        size: file.size,
        addedAt: new Date().toISOString(),
      });
    }

    if (uploaded.length === 0) return;
    entry.files = [...entry.files, ...uploaded];
    await persistEntry(entry);
    rerenderDay(date);
  };

  const deleteFile = async (date: string, file: FileAttachment): Promise<void> => {
    if (!supabaseClient) return;
    const entry = entries.get(date);
    if (!entry) return;

    const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).remove([file.path]);
    if (error) {
      showError(`Couldn't delete ${file.name}: ${error.message}`);
      return;
    }

    entry.files = entry.files.filter((existing) => existing.path !== file.path);
    await persistEntry(entry);
    rerenderDay(date);
  };

  const editNote = async (date: string, note: NoteEntry, newText: string): Promise<void> => {
    const entry = entries.get(date);
    if (!entry) return;
    entry.notes = entry.notes.map((existing) =>
      existing.addedAt === note.addedAt ? { ...existing, text: newText } : existing,
    );
    await persistEntry(entry);
    rerenderDay(date);
  };

  const deleteNote = async (date: string, note: NoteEntry): Promise<void> => {
    const entry = entries.get(date);
    if (!entry) return;
    entry.notes = entry.notes.filter((existing) => existing.addedAt !== note.addedAt);
    await persistEntry(entry);
    rerenderDay(date);
  };

  const buildDayElement = (entry: DayEntry, isExpanded = false): HTMLElement =>
    renderDayEntry({
      entry,
      isEditable: entry.date === today,
      isExpanded,
      onUploadFiles: uploadFiles,
      onDeleteFile: deleteFile,
      onEditNote: editNote,
      onDeleteNote: deleteNote,
    });

  const rerenderDay = (date: string) => {
    const entry = entries.get(date);
    const existing = dayElements.get(date);
    if (!entry || !existing) return;
    const wasExpanded = existing.classList.contains("is-expanded");
    const replacement = buildDayElement(entry, wasExpanded);
    existing.replaceWith(replacement);
    dayElements.set(date, replacement);
    observer.observe(replacement);
  };

  const renderDays = () => {
    dayList.innerHTML = "";
    dayElements.clear();
    sortedDates().forEach((date) => {
      const entry = entries.get(date)!;
      const element = buildDayElement(entry);
      dayList.append(element);
      dayElements.set(date, element);
    });
  };

  renderDays();

  const timeSelect: TimeSelectController = renderTimeSelect({
    container: timeSelectContainer,
    dates: sortedDates(),
    onSelect: (date) => scrollToDay(date),
  });

  renderComposer({
    container: composerContainer,
    onSubmit: async ({ text, links, files }) => {
      const entry = entries.get(today) ?? createEmptyDayEntry(today);
      const now = new Date().toISOString();
      if (text) entry.notes = [...entry.notes, { text, addedAt: now }];
      if (links.length > 0) {
        entry.links = [
          ...entry.links,
          ...links.map((url) => ({ url, addedAt: now })),
        ];
      }
      entries.set(today, entry);

      if (files.length > 0) {
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        await uploadFiles(today, transfer.files);
      } else {
        await persistEntry(entry);
        rerenderDay(today);
      }

      if (text) {
        const reply = await askAssistant(entry.notes);
        if (reply) {
          const latest = entries.get(today) ?? entry;
          latest.notes = [
            ...latest.notes,
            { text: reply, addedAt: new Date().toISOString(), author: "assistant" },
          ];
          await persistEntry(latest);
          rerenderDay(today);
        }
      }
    },
  });

  const observer = new IntersectionObserver(
    (visibleEntries) => {
      const mostVisible = visibleEntries
        .filter((item) => item.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!mostVisible) return;
      const date = mostVisible.target.id.replace("day-", "");
      timeSelect.setActiveDate(date);
      stickyHeader.textContent = formatFullDayLabel(date);
    },
    { root: scrollArea, threshold: [0.5] },
  );
  dayElements.forEach((element) => observer.observe(element));

  function scrollToDay(date: string) {
    const element = dayElements.get(date);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#day-${date}`);
  }

  const initialHash = window.location.hash.replace("#day-", "");
  if (initialHash && dayElements.has(initialHash)) {
    scrollToDay(initialHash);
  } else {
    scrollArea.scrollTop = scrollArea.scrollHeight;
    timeSelect.setActiveDate(today);
    stickyHeader.textContent = formatFullDayLabel(today);
  }
}

async function loadEntries(userId: string): Promise<Map<string, DayEntry>> {
  const entries = new Map<string, DayEntry>();
  if (!supabaseClient) return entries;

  const { data, error } = await supabaseClient
    .from("contribution_reports")
    .select("*")
    .eq("user_id", userId)
    .order("report_date", { ascending: true });

  if (error || !data) return entries;

  data.forEach((row) => {
    entries.set(row.report_date, {
      date: row.report_date,
      northStar: row.north_star ?? "",
      nextSteps: row.next_steps ?? [],
      morningReport: row.morning_report ?? null,
      middayReport: row.midday_report ?? null,
      finalReport: row.final_report ?? null,
      links: row.links ?? [],
      files: row.files ?? [],
      notes: row.notes ?? [],
    });
  });

  return entries;
}
