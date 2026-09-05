export type LiveClassStatus = "UPCOMING" | "LIVE" | "ENDED";

/**
 * No manually-maintained "is it live" flag in the database — status is
 * always derived from scheduledStart/scheduledEnd vs the current time,
 * computed fresh on every read. This is deliberately timezone-safe: it
 * only ever compares Date objects via their internal epoch-millisecond
 * value (`.getTime()`), which is a single absolute instant regardless
 * of what timezone produced it or what timezone is reading it — never
 * a locale-formatted string or the browser's local clock. `now`
 * defaults to `new Date()` (the *server's* clock when called from a
 * Server Component) but is a parameter specifically so a client-side
 * countdown can pass its own tick without duplicating this logic.
 *
 * Fallback when scheduledEnd is not set: the class is considered LIVE
 * for DEFAULT_DURATION_MS after scheduledStart, then ENDED. Two hours
 * comfortably covers a typical live class/workshop without leaving a
 * stream that was never explicitly ended stuck showing "LIVE" for the
 * rest of the day.
 */
export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getLiveClassStatus(
  scheduledStart: Date,
  scheduledEnd: Date | null,
  now: Date = new Date()
): LiveClassStatus {
  const start = scheduledStart.getTime();
  const end = scheduledEnd ? scheduledEnd.getTime() : start + DEFAULT_DURATION_MS;
  const t = now.getTime();

  if (t < start) return "UPCOMING";
  if (t <= end) return "LIVE";
  return "ENDED";
}

/** Effective end instant used for status/countdown purposes — real
 *  scheduledEnd if set, otherwise the same fallback getLiveClassStatus
 *  uses. Exposed so a countdown component doesn't need to reimplement
 *  the fallback rule to know when to stop showing "LIVE". */
export function effectiveEndTime(scheduledStart: Date, scheduledEnd: Date | null): Date {
  return scheduledEnd ?? new Date(scheduledStart.getTime() + DEFAULT_DURATION_MS);
}

/** "2d 4h" / "3h 12m" / "5m 30s" / "12s" — used for both the live
 *  client-side countdown and the dashboard's one-shot server summary. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
