/**
 * Where the lesson video should start when the student reopens the popup in
 * the same visit. The page's saved position is only read when the page loads,
 * so after watching for a while it is stale; the last position the player
 * reported is newer. A video that was watched to the end starts over.
 */
export function resumeSecondsForReopen(
  savedSeconds: number,
  lastReportedSeconds: number,
  durationSeconds: number
): number {
  const last = Math.max(0, Math.floor(lastReportedSeconds));
  if (last <= 0) return Math.max(0, savedSeconds);
  if (durationSeconds > 0 && last >= durationSeconds - 2) return 0;
  return last;
}
