/*  A dialog in the middle of the screen where the user picks a week, for example to
    generate a weekly report. They pick any day and the whole week it falls in (Monday to
    Sunday) is selected. Closes on Cancel, Escape, or a click outside the dialog.
*/
import { localIsoDate } from "../../../../helpers/format";

export type WeeklySelectionOptions = {
  title: string;
  confirmLabel: string;
  onSelect: (startDate: string, endDate: string) => void;
};

export function openWeeklySelection(options: WeeklySelectionOptions): void {
  const { title, confirmLabel, onSelect } = options;
  const today = localIsoDate();
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "day-selection-overlay";

  const dialog = document.createElement("div");
  dialog.className = "day-selection";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "weekly-selection-title");

  const heading = document.createElement("h2");
  heading.id = "weekly-selection-title";
  heading.textContent = title;

  const label = document.createElement("label");
  label.textContent = "Any day in the week";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = today;
  dateInput.max = today;
  label.append(dateInput);

  const weekLabel = document.createElement("p");
  weekLabel.className = "day-selection-note";
  weekLabel.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "day-selection-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "is-primary";
  confirmButton.textContent = confirmLabel;

  actions.append(cancelButton, confirmButton);
  dialog.append(heading, label, weekLabel, actions);
  overlay.append(dialog);

  const showWeek = () => {
    const week = dateInput.value ? weekContaining(dateInput.value) : null;
    weekLabel.textContent = week ? `${shortLabel(week.start)} – ${shortLabel(week.end)}` : "";
  };
  showWeek();

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    previousFocus?.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  dateInput.addEventListener("input", showWeek);
  cancelButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  confirmButton.addEventListener("click", () => {
    if (!dateInput.value) {
      dateInput.focus();
      return;
    }
    const week = weekContaining(dateInput.value);
    close();
    onSelect(week.start, week.end);
  });
  document.addEventListener("keydown", onKeydown);

  document.body.append(overlay);
  dateInput.focus();
}

// The Monday-to-Sunday week that contains a YYYY-MM-DD date.
function weekContaining(date: string): { start: string; end: string } {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

function shortLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
