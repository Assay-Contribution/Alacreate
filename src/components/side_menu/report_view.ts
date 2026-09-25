/*  A large dialog that generates the AI report for a day and shows it: progress while the
    documents are read, then the report as it's written. The report is saved to the day
    automatically. Editing and PDF export will be added here later.
*/
import { generateReport } from "../../ai/frontend/report";
import { escapeHtml, formatFullDayLabel } from "../timeline/format";

export function openReportView(date: string): void {
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.className = "day-selection-overlay";

  const dialog = document.createElement("div");
  dialog.className = "report-view";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `Report for ${formatFullDayLabel(date)}`);

  const status = document.createElement("p");
  status.className = "report-view-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "Starting…";

  const body = document.createElement("div");
  body.className = "report-view-body";

  const actions = document.createElement("div");
  actions.className = "day-selection-actions";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  actions.append(closeButton);

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

  // Closing early is fine: the report still finishes and is saved on the server.
  let written = "";
  void generateReport(date, (event) => {
    if (event.type === "progress") {
      status.textContent = event.message;
    } else if (event.type === "delta") {
      written += event.text;
      body.innerHTML = renderMarkdown(written);
    } else if (event.type === "done") {
      status.textContent = "Report saved to this day.";
      body.innerHTML = renderMarkdown(event.report);
    } else {
      status.textContent = event.message;
      status.classList.add("is-error");
    }
  });
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
