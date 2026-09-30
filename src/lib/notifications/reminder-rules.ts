import { addDhakaDays, dhakaDayDiff, dhakaHour, dhakaStartOfDay } from "@/lib/timezone";

/**
 * Timing rules for the scheduled student reminders
 * (api/cron/notification-reminders). Kept free of DB access so the rules
 * can be unit-tested. "Day" and "hour" are always Bangladesh time.
 */

/** A live exam's students are reminded once it is this close to opening. */
export const EXAM_REMINDER_LEAD_MINUTES = 120;
/** A challenge's students are reminded once it is this close to its due time. */
export const ASSIGNMENT_DUE_LEAD_HOURS = 24;
/** Streak-risk reminders go out from this Dhaka hour (8 PM) onwards. */
export const STREAK_RISK_FROM_DHAKA_HOUR = 20;
/** A 1-day "streak" isn't worth a nag; at-risk means a streak of at least this. */
export const STREAK_RISK_MIN_STREAK = 2;

/** Half-open window `(now, now + leadMs]` — something that hasn't happened yet but soon will. */
export function upcomingWindow(now: Date, leadMs: number): { gt: Date; lte: Date } {
  return { gt: now, lte: new Date(now.getTime() + leadMs) };
}

/**
 * A streak is at risk when it is worth protecting, the student's last
 * activity day was yesterday (Dhaka), so nothing has been logged today
 * yet, and it is evening in Dhaka. A last activity two or more days ago
 * means the streak is already broken, not at risk.
 *
 * Mirrors updateStreak() in lib/gamification/award-xp.ts: activity
 * "yesterday" is what makes today's first activity +1 the streak.
 */
export function isStreakAtRisk(
  stats: { currentStreak: number; lastActivityDate: Date | null },
  now: Date = new Date()
): boolean {
  if (!stats.lastActivityDate) return false;
  if (stats.currentStreak < STREAK_RISK_MIN_STREAK) return false;
  if (dhakaHour(now) < STREAK_RISK_FROM_DHAKA_HOUR) return false;
  return dhakaDayDiff(stats.lastActivityDate, now) === 1;
}

/** Start of the Dhaka day before `now`; the `lastActivityDate` of a student whose streak is at risk. */
export function dhakaStartOfYesterday(now: Date = new Date()): Date {
  return addDhakaDays(dhakaStartOfDay(now), -1);
}
