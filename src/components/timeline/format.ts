export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function daysAgo(date: string, today: Date): number {
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.round(
    (startOfToday.getTime() - parseDay(date).getTime()) / 86_400_000,
  );
}

export function relativeDayLabel(date: string, today: Date = new Date()): string {
  const diff = daysAgo(date, today);
  if (diff < 0) return "Upcoming";
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30) {
    const weeks = Math.round(diff / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (diff < 365) {
    const months = Math.round(diff / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = Math.round(diff / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export function formatFullDayLabel(date: string, today: Date = new Date()): string {
  const parsed = parseDay(date);
  const weekday = parsed.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday}, ${monthDay} (${relativeDayLabel(date, today)})`;
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
