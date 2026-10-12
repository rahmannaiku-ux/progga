import { cache } from "react";
import { db } from "@/lib/db/client";
import { updateStreak } from "@/lib/gamification/award-xp";
import { nextStreak } from "@/lib/gamification/streak";

/**
 * The signed-in hero's HeroStats row, created on first use.
 *
 * Pages and layouts used to call `heroStats.upsert({ update: {} })` on every
 * render: a *write* on every page view. A plain read is enough almost every
 * time. `cache()` also shares the result between the layout and the page for
 * the same request.
 *
 * This is also where the daily streak is counted: the first time a hero opens
 * the app on a new Bangladesh day, the streak moves on (see updateStreak).
 * That is one extra write per student per day, and every later read that day
 * skips it. Only ever call this for the person who is signed in.
 */
export const getOrCreateHeroStats = cache(async (userId: string) => {
  const existing =
    (await db.heroStats.findUnique({ where: { userId } })) ??
    (await db.heroStats.upsert({ where: { userId }, create: { userId }, update: {} }));
  if (nextStreak(existing) === null) return existing;
  return (await updateStreak(userId)) ?? (await db.heroStats.findUniqueOrThrow({ where: { userId } }));
});
