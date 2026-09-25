/*  This should have a calendar icon at the top where you can select to pick the specific day you want to look at
    Below that caendar, there should be a list of days such as:
    Today, Yesterday, 2 days ago, one week ago, 2 weeks ago, one month ago, ect.


*/
import { relativeDayLabel } from "./format";

export type TimeSelectOptions = {
  container: HTMLElement;
  dates: string[];
  onSelect: (date: string) => void;
};

export type TimeSelectController = {
  setActiveDate: (date: string) => void;
  refresh: (dates: string[]) => void;
};

export function renderTimeSelect(options: TimeSelectOptions): TimeSelectController {
  const { container, onSelect } = options;
  let dates = [...options.dates].sort();

  container.innerHTML = "";
  container.classList.add("time-select");

  const calendarButton = document.createElement("button");
  calendarButton.type = "button";
  calendarButton.className = "time-select-calendar";
  calendarButton.setAttribute("aria-label", "Jump to a specific day");
  calendarButton.innerHTML = `
    <svg class="time-select-calendar-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <path d="M4 3.5h1.6M18.4 3.5H20M4 20.5h1.6M18.4 20.5H20" stroke-linecap="round" />
      <rect x="4" y="6" width="16" height="14" rx="1.5" />
      <path d="M4 10.5h16" />
      <path d="M8 3.5v4M16 3.5v4" stroke-linecap="round" />
      <circle cx="8" cy="15" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  `;

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "time-select-date-input";
  dateInput.tabIndex = -1;

  calendarButton.addEventListener("click", () => {
    if (typeof dateInput.showPicker === "function") {
      dateInput.showPicker();
    } else {
      dateInput.click();
    }
  });

  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    const nearest = nearestAvailableDate(dateInput.value, dates);
    if (nearest) onSelect(nearest);
  });

  const list = document.createElement("div");
  list.className = "time-select-list";

  container.append(calendarButton, dateInput, list);

  const buttons = new Map<string, HTMLButtonElement>();

  const renderList = () => {
    list.innerHTML = "";
    buttons.clear();
    [...dates].reverse().forEach((date) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-select-item";
      button.textContent = relativeDayLabel(date);
      button.dataset.date = date;
      button.addEventListener("click", () => onSelect(date));
      list.append(button);
      buttons.set(date, button);
    });
  };

  renderList();

  return {
    setActiveDate(date) {
      buttons.forEach((button, key) => {
        button.classList.toggle("is-active", key === date);
      });
    },
    refresh(nextDates) {
      dates = [...nextDates].sort();
      renderList();
    },
  };
}

function nearestAvailableDate(target: string, dates: string[]): string | null {
  if (dates.length === 0) return null;
  const targetTime = new Date(`${target}T00:00:00`).getTime();
  return dates.reduce((closest, date) => {
    const closestDiff = Math.abs(
      new Date(`${closest}T00:00:00`).getTime() - targetTime,
    );
    const diff = Math.abs(new Date(`${date}T00:00:00`).getTime() - targetTime);
    return diff < closestDiff ? date : closest;
  }, dates[0]);
}
