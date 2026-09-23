/*  This is a component that shows the uploaded files, links day and time description for a certain day.
    People should be able to see a brief preview of links that are uploaded, kind of like links on imessage
    This component should initially be to something minimal and only show everything when an expand arrow is pressed
    In the expanded view, users should be able to upload files like daily reports if they would like.
*/
import { escapeHtml, fileSizeLabel, formatFullDayLabel } from "./format";
import { summarizeDay } from "./summarize";
import type { DayEntry, FileAttachment, NoteEntry } from "./types";

export type DayEntryOptions = {
  entry: DayEntry;
  isEditable: boolean;
  isExpanded?: boolean;
  onUploadFiles: (date: string, files: FileList) => Promise<void> | void;
  onDeleteFile: (date: string, file: FileAttachment) => Promise<void> | void;
  onEditNote: (date: string, note: NoteEntry, newText: string) => Promise<void> | void;
  onDeleteNote: (date: string, note: NoteEntry) => Promise<void> | void;
};

export function renderDayEntry(options: DayEntryOptions): HTMLElement {
  const {
    entry,
    isEditable,
    isExpanded = false,
    onUploadFiles,
    onDeleteFile,
    onEditNote,
    onDeleteNote,
  } = options;

  const section = document.createElement("section");
  section.id = `day-${entry.date}`;
  section.className = "day-entry";
  if (isEditable) section.classList.add("is-today");
  if (isExpanded) section.classList.add("is-expanded");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "day-entry-header";
  header.setAttribute("aria-expanded", String(isExpanded));
  header.innerHTML = `
    <span class="day-entry-date">${escapeHtml(formatFullDayLabel(entry.date))}</span>
    <span class="day-entry-toggle" aria-hidden="true">⌄</span>
  `;

  const preview = document.createElement("div");
  preview.className = "day-entry-preview";
  const hasPreviewContent =
    entry.links.length > 0 || entry.files.length > 0 || entry.notes.length > 0;
  if (hasPreviewContent) {
    const summaryEl = document.createElement("p");
    summaryEl.className = "day-entry-note-preview";
    summaryEl.textContent = fallbackSummary(entry);
    preview.append(summaryEl);
    summarizeDay(entry).then((summary) => {
      if (summary) summaryEl.textContent = summary;
    });

    if (entry.links.length > 0) preview.append(renderLinkChips(entry.links.slice(-3)));
    if (entry.files.length > 0) preview.append(renderFileChips(entry.files.slice(-3)));
  } else {
    const empty = document.createElement("p");
    empty.className = "day-entry-empty";
    empty.textContent = isEditable
      ? "Nothing logged yet today."
      : "No activity recorded.";
    preview.append(empty);
  }

  const details = document.createElement("div");
  details.className = "day-entry-details";
  details.hidden = !isExpanded;
  details.append(renderDetails());

  header.addEventListener("click", () => {
    const expanded = header.getAttribute("aria-expanded") === "true";
    header.setAttribute("aria-expanded", String(!expanded));
    details.hidden = expanded;
    section.classList.toggle("is-expanded", !expanded);
  });

  section.append(header, preview, details);
  return section;

  function confirmDeleteFile(date: string, file: FileAttachment) {
    if (window.confirm("Are you sure you want to delete this file?")) {
      onDeleteFile(date, file);
    }
  }

  function confirmDeleteNote(date: string, note: NoteEntry) {
    if (window.confirm("Are you sure you want to delete this note?")) {
      onDeleteNote(date, note);
    }
  }

  function renderDetails(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "day-entry-form";

    if (entry.notes.length > 0 || entry.files.length > 0) {
      wrapper.append(
        renderActivityFeed(
          entry,
          isEditable
            ? {
                onDeleteFile: (file) => confirmDeleteFile(entry.date, file),
                onEditNote: (note, newText) => onEditNote(entry.date, note, newText),
                onDeleteNote: (note) => confirmDeleteNote(entry.date, note),
              }
            : undefined,
        ),
      );
    }

    if (entry.links.length > 0) wrapper.append(renderLinkChips(entry.links));

    wrapper.append(isEditable ? renderEditableFields() : renderReadOnlyFields());
    return wrapper;
  }

  function renderReadOnlyFields(): HTMLElement {
    const readOnly = document.createElement("div");
    readOnly.className = "day-entry-readonly";

    if (entry.nextSteps.length > 0) {
      const block = document.createElement("div");
      block.className = "day-entry-field";
      const items = entry.nextSteps
        .map((task) => `<li>${escapeHtml(task.title)} — ${task.minutes} min</li>`)
        .join("");
      block.innerHTML = `<h4>Next steps</h4><ul>${items}</ul>`;
      readOnly.append(block);
    }

    if (readOnly.children.length === 0) {
      const empty = document.createElement("p");
      empty.className = "day-entry-empty";
      empty.textContent = "No report was saved for this day.";
      readOnly.append(empty);
    }

    return readOnly;
  }

  function renderEditableFields(): HTMLElement {
    const form = document.createElement("div");
    form.className = "day-entry-editable";

    const uploadField = document.createElement("div");
    uploadField.className = "day-entry-labeled-field";
    const uploadLabel = document.createElement("span");
    uploadLabel.textContent = "Attach new file";
    uploadField.append(uploadLabel);

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.multiple = true;
    uploadInput.hidden = true;
    uploadInput.addEventListener("change", async () => {
      if (uploadInput.files && uploadInput.files.length > 0) {
        await onUploadFiles(entry.date, uploadInput.files);
        uploadInput.value = "";
      }
    });

    const uploadButton = document.createElement("button");
    uploadButton.type = "button";
    uploadButton.className = "day-entry-upload-button";
    uploadButton.textContent = "Upload";
    uploadButton.addEventListener("click", () => uploadInput.click());

    uploadField.append(uploadButton, uploadInput);
    uploadField.classList.add("day-entry-dropzone");

    let dragDepth = 0;
    uploadField.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth++;
      uploadField.classList.add("is-dragover");
    });
    uploadField.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    });
    uploadField.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) uploadField.classList.remove("is-dragover");
    });
    uploadField.addEventListener("drop", async (event) => {
      event.preventDefault();
      dragDepth = 0;
      uploadField.classList.remove("is-dragover");
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length === 0) return;
      const transfer = new DataTransfer();
      dropped.forEach((file) => transfer.items.add(file));
      await onUploadFiles(entry.date, transfer.files);
    });

    form.append(uploadField);
    return form;
  }
}

type ActivityItem =
  | { type: "note"; addedAt: string; note: NoteEntry }
  | { type: "file"; addedAt: string; file: FileAttachment };

type ActivityActions = {
  onDeleteFile: (file: FileAttachment) => void;
  onEditNote: (note: NoteEntry, newText: string) => void;
  onDeleteNote: (note: NoteEntry) => void;
};

function renderActivityFeed(entry: DayEntry, actions?: ActivityActions): HTMLElement {
  const items: ActivityItem[] = [
    ...entry.notes.map((note): ActivityItem => ({
      type: "note",
      addedAt: note.addedAt,
      note,
    })),
    ...entry.files.map((file): ActivityItem => ({
      type: "file",
      addedAt: file.addedAt,
      file,
    })),
  ].sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());

  const list = document.createElement("ul");
  list.className = "day-entry-activity";

  items.forEach((item) => {
    const time = new Date(item.addedAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    const listItem = document.createElement("li");
    listItem.className = "day-entry-activity-item";

    const timeSpan = document.createElement("span");
    timeSpan.className = "note-time";
    timeSpan.textContent = time;
    listItem.append(timeSpan);

    if (item.type === "note") {
      const note = item.note;
      const textSpan = document.createElement("span");
      textSpan.className = "day-entry-activity-text";
      textSpan.textContent = note.text;
      listItem.append(textSpan);

      if (actions) {
        const editActions = document.createElement("span");
        editActions.className = "day-entry-activity-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "day-entry-activity-action";
        editButton.setAttribute("aria-label", "Edit note");
        editButton.textContent = "✎";

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "day-entry-activity-action is-delete";
        deleteButton.setAttribute("aria-label", "Delete note");
        deleteButton.textContent = "×";

        editButton.addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "day-entry-activity-edit-input";
          input.value = note.text;

          const stopEditing = () => {
            input.replaceWith(textSpan);
            editActions.hidden = false;
          };

          const commit = () => {
            const value = input.value.trim();
            if (value && value !== note.text) {
              actions.onEditNote(note, value);
            } else {
              stopEditing();
            }
          };

          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              stopEditing();
            }
          });
          input.addEventListener("blur", commit);

          textSpan.replaceWith(input);
          editActions.hidden = true;
          input.focus();
          input.select();
        });

        deleteButton.addEventListener("click", () => actions.onDeleteNote(note));

        editActions.append(editButton, deleteButton);
        listItem.append(editActions);
      }
    } else {
      listItem.classList.add("day-entry-activity-file");
      const file = item.file;

      const anchor = document.createElement("a");
      anchor.className = "file-chip";
      anchor.href = file.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.innerHTML = `
        <span class="file-chip-icon" aria-hidden="true">📄</span>
        <span class="file-chip-name">${escapeHtml(file.name)}</span>
        <span class="file-chip-size">${escapeHtml(fileSizeLabel(file.size))}</span>
      `;
      listItem.append(anchor);

      if (actions) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "file-chip-remove-inline";
        deleteButton.setAttribute("aria-label", `Delete ${file.name}`);
        deleteButton.textContent = "×";
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          actions.onDeleteFile(file);
        });
        listItem.append(deleteButton);
      }
    }

    list.append(listItem);
  });

  return list;
}

function fallbackSummary(entry: DayEntry): string {
  if (entry.notes.length > 0) return entry.notes[entry.notes.length - 1].text;
  const parts: string[] = [];
  if (entry.files.length > 0) {
    parts.push(`${entry.files.length} file${entry.files.length > 1 ? "s" : ""}`);
  }
  if (entry.links.length > 0) {
    parts.push(`${entry.links.length} link${entry.links.length > 1 ? "s" : ""}`);
  }
  return parts.length > 0 ? `${parts.join(" and ")} added` : "";
}

function renderLinkChips(links: DayEntry["links"]): HTMLElement {
  const row = document.createElement("div");
  row.className = "day-entry-links";
  links.forEach((link) => {
    let hostname = link.url;
    try {
      hostname = new URL(link.url).hostname.replace(/^www\./, "");
    } catch {
      // leave hostname as the raw url if it doesn't parse
    }
    const anchor = document.createElement("a");
    anchor.className = "link-chip";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.innerHTML = `
      <img class="link-chip-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32" alt="" aria-hidden="true" />
      <span class="link-chip-host">${escapeHtml(hostname)}</span>
    `;
    row.append(anchor);
  });
  return row;
}

function renderFileChips(
  files: FileAttachment[],
  onDelete?: (file: FileAttachment) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "day-entry-files";
  files.forEach((file) => {
    const wrap = document.createElement("span");
    wrap.className = "file-chip-wrap";

    const anchor = document.createElement("a");
    anchor.className = "file-chip";
    anchor.href = file.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.innerHTML = `
      <span class="file-chip-icon" aria-hidden="true">📄</span>
      <span class="file-chip-name">${escapeHtml(file.name)}</span>
      <span class="file-chip-size">${escapeHtml(fileSizeLabel(file.size))}</span>
    `;
    wrap.append(anchor);

    if (onDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "file-chip-remove";
      deleteButton.setAttribute("aria-label", `Delete ${file.name}`);
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete(file);
      });
      wrap.append(deleteButton);
    }

    row.append(wrap);
  });
  return row;
}
