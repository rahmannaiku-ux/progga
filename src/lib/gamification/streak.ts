import { dhakaDayDiff } from "@/lib/timezone";

/**
 * What a student's streak becomes when they show up at `now`, or `null`
 * when today (Bangladesh time) is already counted and nothing changes.
 * +1 if the last counted day was yesterday, back to 1 after a longer gap.
 */
export function nextStreak(
  stats: { currentStreak: number; lastActivityDate: Date | null },
  now: Date = new Date()
): number | null {
  if (!stats.lastActivityDate) return 1;
  const days = dhakaDayDiff(stats.lastActivityDate, now);
  if (days <= 0) return null;
  return days === 1 ? stats.currentStreak + 1 : 1;
}
