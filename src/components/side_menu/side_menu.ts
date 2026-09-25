/*  This imports day_selection.ts

    This will be a component that contains buttons that user can push to generate a daily report, 
    and later see a calendar with their activity level. This will be implemented later. 
    We will first create a button that has generate report. 
    When the create report buttun is clicked, it will display the day_selecton in the middle of the screen.
    
    This may be for another file, but after the button is clicked and the day is selected, 
    the AI will generate a report for that day.
    
*/
import { openDaySelection } from "./day_selection";

export type SideMenuOptions = {
  container: HTMLElement;
  onGenerateReport: (date: string) => void;
};

export function renderSideMenu(options: SideMenuOptions): void {
  const { container, onGenerateReport } = options;

  container.innerHTML = "";
  container.classList.add("side-menu");

  // Buttons sit at the top of the side menu.
  const actions = document.createElement("div");
  actions.className = "side-menu-actions";

  const generateReportButton = document.createElement("button");
  generateReportButton.type = "button";
  generateReportButton.className = "side-menu-button";
  generateReportButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
      <path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" stroke-linecap="round" />
    </svg>
    <span>Generate report</span>
  `;
  generateReportButton.addEventListener("click", () =>
    openDaySelection({
      title: "Generate a report",
      confirmLabel: "Generate",
      onSelect: onGenerateReport,
    }),
  );

  actions.append(generateReportButton);
  container.append(actions);
}
