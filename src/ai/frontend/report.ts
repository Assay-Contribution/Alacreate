import { streamAi } from "./client";

export type ReportEvent =
  | { type: "progress"; message: string }
  | { type: "delta"; text: string }
  | { type: "done"; report: string }
  | { type: "error"; message: string };

// Generates (and saves) the AI report for a day. onEvent receives progress updates, the
// report text as it's written, and finally the whole report. Resolves to the report, or
// null if it couldn't be generated.
export async function generateReport(
  date: string,
  onEvent: (event: ReportEvent) => void,
): Promise<string | null> {
  let report: string | null = null;
  let failed = false;
  let handled = 0;
  const raw = await streamAi(
    "/api/generate-report",
    { date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    // The server sends one JSON event per line; handle each complete line once.
    (textSoFar) => {
      const lines = textSoFar.split("\n");
      for (; handled < lines.length - 1; handled++) {
        if (!lines[handled].trim()) continue;
        const event = JSON.parse(lines[handled]) as ReportEvent;
        if (event.type === "done") report = event.report;
        if (event.type === "error") failed = true;
        onEvent(event);
      }
    },
  );
  if (!raw && !failed) onEvent({ type: "error", message: "The report couldn't be generated. Try again." });
  return report;
}
