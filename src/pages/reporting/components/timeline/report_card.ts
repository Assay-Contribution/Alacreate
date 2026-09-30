/*  A saved report shown in the timeline: the daily report at the bottom of its day, the
    weekly report after the last day of its week. It can be opened or downloaded as an
    editable PDF.
*/
import { downloadReportPdf } from "../../../../helpers/report_pdf";
import { reportFileName, showSavedReport } from "../report_view";

export type ReportCardOptions = {
  startDate: string;
  endDate: string;
  report: string;
};

export function renderReportCard(options: ReportCardOptions): HTMLElement {
  const { startDate, endDate, report } = options;
  const weekly = startDate !== endDate;

  const card = document.createElement("div");
  card.className = weekly ? "report-card is-weekly" : "report-card";

  const icon = document.createElement("span");
  icon.className = "report-card-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📄";

  const text = document.createElement("div");
  text.className = "report-card-text";
  const title = document.createElement("strong");
  title.textContent = weekly ? "Weekly report" : "Daily report";
  const detail = document.createElement("span");
  detail.textContent = weekly ? `${shortDate(startDate)} – ${shortDate(endDate)}` : "Editable PDF";
  text.append(title, detail);

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "report-card-button";
  viewButton.textContent = "View";
  viewButton.addEventListener("click", () => showSavedReport(startDate, endDate, report));

  const pdfButton = document.createElement("button");
  pdfButton.type = "button";
  pdfButton.className = "report-card-button is-primary";
  pdfButton.textContent = "PDF";
  pdfButton.setAttribute("aria-label", `Download the ${weekly ? "weekly" : "daily"} report as an editable PDF`);
  pdfButton.addEventListener("click", () => void downloadReportPdf(report, reportFileName(startDate, endDate)));

  card.append(icon, text, viewButton, pdfButton);
  return card;
}

function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
