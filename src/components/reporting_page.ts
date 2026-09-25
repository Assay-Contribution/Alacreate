/*  The main component for the reporting page: everything below the site nav and the
    "Contribution Timeline" header. It imports the side menu and the timeline, with the
    side menu on the left and the timeline on the right.
*/
import { openReportView } from "./side_menu/report_view";
import { renderSideMenu } from "./side_menu/side_menu";
import { initTimeline } from "./timeline/timeline";

export async function initReportingPage(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  root.classList.add("reporting-page");

  const sideMenuContainer = document.createElement("aside");
  const timelineContainer = document.createElement("div");
  timelineContainer.className = "timeline-page-root";
  root.append(sideMenuContainer, timelineContainer);

  renderSideMenu({
    container: sideMenuContainer,
    onGenerateReport: (date) => openReportView(date),
  });

  await initTimeline(timelineContainer);
}
