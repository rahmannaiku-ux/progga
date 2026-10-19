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

/** What one lesson's saved progress looks like to the progress bars. */
export type LessonProgressShare = {
  isCompleted: boolean;
  watchedSeconds: number;
  /** Length saved with the progress (the player's measurement); 0 if unknown. */
  durationSec: number;
};

/** A lesson counts as complete at this share of real playback (see COMPLETION_WATCH_RATIO in lesson-progress.ts). */
const WATCH_RATIO_FOR_FULL_CREDIT = 0.85;

/**
 * How much of one lesson counts as done, 0..1. A completed lesson is 1. A
 * partly watched one counts in proportion to the playback that completing
 * it needs, but stays just under 1 until it really is completed, so a bar
 * can't look finished early. `lessonDurationSec` is the mentor-entered
 * length (0 when never set, then the length the player measured is used).
 */
export function lessonShare(progress: LessonProgressShare | null | undefined, lessonDurationSec = 0): number {
  if (!progress) return 0;
  if (progress.isCompleted) return 1;
  const duration = lessonDurationSec > 0 ? lessonDurationSec : progress.durationSec;
  if (duration <= 0 || progress.watchedSeconds <= 0) return 0;
  return Math.min(0.99, progress.watchedSeconds / (duration * WATCH_RATIO_FOR_FULL_CREDIT));
}

/**
 * Percentage for a set of lessons from their shares (lessonShare). Same
 * rounding rules as missionProgressPct: 100 only when every lesson is
 * complete; and any real progress shows at least 1%, so the bar moves from
 * the first minutes of watching instead of only when a lesson is finished.
 */
export function progressPctFromShares(shares: number[], totalLessons: number): number {
  if (totalLessons <= 0) return 0;
  const done = shares.reduce((sum, s) => sum + Math.max(0, Math.min(1, s)), 0);
  if (done <= 0) return 0;
  const allComplete = shares.filter((s) => s >= 1).length >= totalLessons;
  if (allComplete) return 100;
  return Math.max(1, Math.min(99, Math.round((done / totalLessons) * 100)));
}
