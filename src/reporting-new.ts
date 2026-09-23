import { initTimeline } from "./components/timeline/timeline";

const root = document.querySelector<HTMLDivElement>("#timelineRoot");
if (root) initTimeline(root);
