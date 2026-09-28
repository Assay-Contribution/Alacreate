/*  A dialog in the middle of the screen where the user picks a day, for example to
    generate a report for it. Closes on Cancel, Escape, or a click outside the dialog.
*/

export type DaySelectionOptions = {
  title: string;
  confirmLabel: string;
  onSelect: (date: string) => void;
};

export function openDaySelection(options: DaySelectionOptions): void {
  const { title, confirmLabel, onSelect } = options;
  const today = new Date().toLocaleDateString("en-CA");
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "day-selection-overlay";

  const dialog = document.createElement("div");
  dialog.className = "day-selection";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "day-selection-title");

  const heading = document.createElement("h2");
  heading.id = "day-selection-title";
  heading.textContent = title;

  const label = document.createElement("label");
  label.textContent = "Day";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = today;
  dateInput.max = today;
  label.append(dateInput);

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
  dialog.append(heading, label, actions);
  overlay.append(dialog);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    previousFocus?.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  cancelButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  confirmButton.addEventListener("click", () => {
    if (!dateInput.value) {
      dateInput.focus();
      return;
    }
    close();
    onSelect(dateInput.value);
  });
  document.addEventListener("keydown", onKeydown);

  document.body.append(overlay);
  dateInput.focus();
}
