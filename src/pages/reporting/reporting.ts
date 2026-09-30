/*  The reporting page: everything below the site nav and the "Contribution Timeline"
    header. It puts the side menu on the left and the timeline on the right, and connects
    them through the report viewer. The pieces are in ./components/.
*/
import { openReportView } from "./components/report_view";
import { renderSideMenu } from "./components/side_menu";
import { initTimeline, type TimelineController } from "./components/timeline";

async function initReportingPage(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  root.classList.add("reporting-page");

  const sideMenuContainer = document.createElement("aside");
  const timelineContainer = document.createElement("div");
  timelineContainer.className = "timeline-page-root";
  root.append(sideMenuContainer, timelineContainer);

  // Newly generated reports appear in the timeline as soon as they're saved.
  let timeline: TimelineController | undefined;
  renderSideMenu({
    container: sideMenuContainer,
    onDailyReport: (date) =>
      openReportView(date, date, (report) => timeline?.showDailyReport(date, report)),
    onWeeklyReport: (startDate, endDate) =>
      openReportView(startDate, endDate, (report) =>
        timeline?.showWeeklyReport(startDate, endDate, report),
      ),
  });

  timeline = await initTimeline(timelineContainer);
}

const root = document.querySelector<HTMLDivElement>("#reportingPageRoot");
if (root) initReportingPage(root);
