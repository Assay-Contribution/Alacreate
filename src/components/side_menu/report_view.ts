/*  A large dialog for reports. openReportView generates a daily or weekly report and shows
    it: progress while the documents are read, then the report as it's written. It's saved
    automatically (replacing any earlier one). showSavedReport opens one that's already
    saved. Either way, once there's a report it can be downloaded as an editable PDF.
*/
import { generateReport } from "../../ai/frontend/report";
import { escapeHtml, formatFullDayLabel } from "../timeline/format";
import { downloadReportPdf } from "./report_pdf";

// Pass the same date twice for a daily report, or a week's first and last day. onSaved is
// called with the report once it has been saved.
export function openReportView(
  startDate: string,
  endDate: string,
  onSaved?: (report: string) => void,
): void {
  const dialog = createReportDialog(startDate, endDate);
  dialog.status.textContent = "Starting…";

  // Closing early is fine: the report still finishes and is saved on the server.
  let written = "";
  void generateReport(startDate, endDate, (event) => {
    if (event.type === "progress") {
      dialog.status.textContent = event.message;
    } else if (event.type === "delta") {
      written += event.text;
      dialog.body.innerHTML = renderMarkdown(written);
    } else if (event.type === "done") {
      dialog.status.textContent = event.saved ? "Report saved." : "Report ready (it couldn't be saved).";
      dialog.showReport(event.report);
      if (event.saved) onSaved?.(event.report);
    } else {
      dialog.status.textContent = event.message;
      dialog.status.classList.add("is-error");
    }
  });
}

export function showSavedReport(startDate: string, endDate: string, report: string): void {
  const dialog = createReportDialog(startDate, endDate);
  dialog.status.textContent = startDate === endDate ? "Daily report" : "Weekly report";
  dialog.showReport(report);
}

// e.g. daily-report-2026-09-24.pdf or weekly-report-2026-09-21.pdf
export function reportFileName(startDate: string, endDate: string): string {
  return `${startDate === endDate ? "daily" : "weekly"}-report-${startDate}.pdf`;
}

function createReportDialog(startDate: string, endDate: string) {
  const label =
    startDate === endDate
      ? formatFullDayLabel(startDate)
      : `the week of ${formatFullDayLabel(startDate)}`;
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "day-selection-overlay";

  const dialog = document.createElement("div");
  dialog.className = "report-view";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Report for ${label}`);

  const status = document.createElement("p");
  status.className = "report-view-status";
  status.setAttribute("aria-live", "polite");

  const body = document.createElement("div");
  body.className = "report-view-body";

  const actions = document.createElement("div");
  actions.className = "day-selection-actions";

  const pdfButton = document.createElement("button");
  pdfButton.type = "button";
  pdfButton.className = "is-primary";
  pdfButton.textContent = "Download editable PDF";
  pdfButton.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  actions.append(closeButton, pdfButton);

  dialog.append(status, body, actions);
  overlay.append(dialog);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    previousFocus?.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);

  document.body.append(overlay);
  closeButton.focus();

  let report = "";
  pdfButton.addEventListener("click", () => {
    void downloadReportPdf(report, reportFileName(startDate, endDate));
  });

  return {
    status,
    body,
    // Shows the finished report and enables the PDF download.
    showReport(markdown: string) {
      report = markdown;
      body.innerHTML = renderMarkdown(markdown);
      pdfButton.hidden = false;
    },
  };
}

// Renders the small Markdown subset the report uses (headings, bullets, bold, paragraphs).
// Everything is escaped first, so text from the AI can never become HTML.
function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    const text = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const heading = text.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length + 1; // # -> h2, since the dialog is inside the page
      html.push(`<h${level}>${heading[2]}</h${level}>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) html.push("<ul>");
      inList = true;
      html.push(`<li>${text.replace(/^[-*]\s+/, "")}</li>`);
    } else if (line) {
      closeList();
      html.push(`<p>${text}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return html.join("");
}
