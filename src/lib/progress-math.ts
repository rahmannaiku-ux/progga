/**
 * Percentage of a mission's published lessons a student has completed.
 *
 * Rounds to the nearest whole number, except that it never shows 100 until
 * every lesson is done: 199 of 200 is 99%, not a "complete" bar with a lesson
 * still waiting. A mission with no lessons is 0%.
 */
export function missionProgressPct(completed: number, total: number): number {
  if (total <= 0 || completed <= 0) return 0;
  if (completed >= total) return 100;
  return Math.min(99, Math.round((completed / total) * 100));
}
