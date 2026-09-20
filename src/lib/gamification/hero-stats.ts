import { cache } from "react";
import { db } from "@/lib/db/client";

/**
 * The signed-in hero's HeroStats row, created on first use.
 *
 * Pages and layouts used to call `heroStats.upsert({ update: {} })` on every
 * render — a *write* on every page view (the hero layout AND the page under
 * it did it, so twice per navigation). A plain read is enough 99.9% of the
 * time; only the very first visit needs the insert. `cache()` also shares
 * the result between the layout and the page for the same request.
 */
export const getOrCreateHeroStats = cache(async (userId: string) => {
  const existing = await db.heroStats.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.heroStats.upsert({ where: { userId }, create: { userId }, update: {} });
});
