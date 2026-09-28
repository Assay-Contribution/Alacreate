import { initReportingPage } from "./components/reporting_page";

const root = document.querySelector<HTMLDivElement>("#reportingPageRoot");
if (root) initReportingPage(root);
