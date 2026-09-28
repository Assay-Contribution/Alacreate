/*  This imports day_selection.ts

    This will be a component that contains buttons that user can push to generate a daily report, 
    and later see a calendar with their activity level. This will be implemented later. 
    We will first create a button that has generate report. 
    When the create report buttun is clicked, it will display the day_selecton in the middle of the screen.
    
    This may be for another file, but after the button is clicked and the day is selected, 
    the AI will generate a report for that day.
    
*/
import { openDaySelection } from "./day_selection";
import { openWeeklySelection } from "./weekly_selection";

export type SideMenuOptions = {
  container: HTMLElement;
  onDailyReport: (date: string) => void;
  onWeeklyReport: (startDate: string, endDate: string) => void;
};

const REPORT_ICON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
    <path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" stroke-linecap="round" />
  </svg>`;

const WEEK_ICON = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
    <path d="M4 10h16M8 3.5v4M16 3.5v4M7.5 14h9" stroke-linecap="round" />
  </svg>`;

export function renderSideMenu(options: SideMenuOptions): void {
  const { container, onDailyReport, onWeeklyReport } = options;

  container.innerHTML = "";
  container.classList.add("side-menu");

  // Buttons sit at the top of the side menu.
  const actions = document.createElement("div");
  actions.className = "side-menu-actions";

  const dailyReportButton = menuButton(REPORT_ICON, "Daily report");
  dailyReportButton.addEventListener("click", () =>
    openDaySelection({
      title: "Daily report",
      confirmLabel: "Generate",
      onSelect: onDailyReport,
    }),
  );

  const weeklyReportButton = menuButton(WEEK_ICON, "Weekly report");
  weeklyReportButton.addEventListener("click", () =>
    openWeeklySelection({
      title: "Weekly report",
      confirmLabel: "Generate",
      onSelect: onWeeklyReport,
    }),
  );

  actions.append(dailyReportButton, weeklyReportButton);
  container.append(actions);
}

function menuButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "side-menu-button";
  button.innerHTML = `${icon}<span>${label}</span>`;
  return button;
}
