import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/config/settings-service";
import { dhakaStartOfDay, dhakaStartOfWeek, dhakaStartOfMonth } from "@/lib/timezone";

/**
 * Leaderboard periods. Resetting the board never touches HeroStats.xp or
 * levels — the "current" board ranks XP earned (RewardEvent ledger rows)
 * since the period start, which is the LATER of:
 *   - the start of the scheduled period (today / this week / this month,
 *     Dhaka time) when the `leaderboard.resetSchedule` setting is on, and
 *   - the newest admin "Reset now" (LeaderboardReset row).
 * With no schedule and no manual reset, there is no period and the board
 * is plain all-time total XP.
 */

export type ResetSchedule = "NEVER" | "DAILY" | "WEEKLY" | "MONTHLY";

export function scheduledPeriodStart(schedule: ResetSchedule, now: Date = new Date()): Date | null {
  switch (schedule) {
    case "DAILY":
      return dhakaStartOfDay(now);
    case "WEEKLY":
      return dhakaStartOfWeek(now);
    case "MONTHLY":
      return dhakaStartOfMonth(now);
    default:
      return null;
  }
}

/** Later of the two candidate starts; null only when both are null. */
export function resolvePeriodStart(scheduled: Date | null, lastManualReset: Date | null): Date | null {
  if (!scheduled) return lastManualReset;
  if (!lastManualReset) return scheduled;
  return scheduled > lastManualReset ? scheduled : lastManualReset;
}

export async function getLeaderboardPeriod(now: Date = new Date()) {
  const [schedule, lastReset] = await Promise.all([
    getSetting("leaderboard.resetSchedule") as Promise<ResetSchedule>,
    db.leaderboardReset.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const start = resolvePeriodStart(scheduledPeriodStart(schedule, now), lastReset?.createdAt ?? null);
  return { schedule, start };
}

const USER_SELECT = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

export type LeaderboardRow = {
  userId: string;
  xp: number; // XP counted for this board (period XP, or total XP for all-time)
  totalXp: number; // lifetime XP, for the level badge
  currentStreak: number;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
};

/**
 * Top `take` rows plus the viewer's own rank. `periodStart` null = all-time
 * (HeroStats.xp); otherwise sums RewardEvent.amount since that instant.
 */
export async function getLeaderboard(
  periodStart: Date | null,
  viewerId: string,
  take: number
): Promise<{ top: LeaderboardRow[]; me: { rank: number; row: LeaderboardRow } | null }> {
  if (!periodStart) {
    const stats = await db.heroStats.findMany({ orderBy: { xp: "desc" }, take, include: { user: { select: USER_SELECT } } });
    const top = stats.map((s) => ({ userId: s.userId, xp: s.xp, totalXp: s.xp, currentStreak: s.currentStreak, user: s.user }));
    if (top.some((r) => r.userId === viewerId)) return { top, me: null };

    const mine = await db.heroStats.findUnique({ where: { userId: viewerId }, include: { user: { select: USER_SELECT } } });
    if (!mine) return { top, me: null };
    const higher = await db.heroStats.count({ where: { xp: { gt: mine.xp } } });
    return {
      top,
      me: { rank: higher + 1, row: { userId: mine.userId, xp: mine.xp, totalXp: mine.xp, currentStreak: mine.currentStreak, user: mine.user } },
    };
  }

  const sums = await db.$queryRaw<{ userId: string; xp: number }[]>(Prisma.sql`
    SELECT "userId", SUM("amount")::int AS xp
    FROM "RewardEvent"
    WHERE "createdAt" >= ${periodStart}
    GROUP BY "userId"
    HAVING SUM("amount") > 0
    ORDER BY xp DESC, MIN("createdAt") ASC
    LIMIT ${take}
  `);

  const inTop = sums.some((s) => s.userId === viewerId);
  let mySum: number | null = null;
  if (!inTop) {
    const agg = await db.rewardEvent.aggregate({ where: { userId: viewerId, createdAt: { gte: periodStart } }, _sum: { amount: true } });
    mySum = agg._sum.amount ?? 0;
  }

  const ids = [...sums.map((s) => s.userId), ...(inTop ? [] : [viewerId])];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { ...USER_SELECT, heroStats: { select: { xp: true, currentStreak: true } } } });
  const byId = new Map(users.map((u) => [u.id, u]));

  const toRow = (userId: string, xp: number): LeaderboardRow | null => {
    const u = byId.get(userId);
    if (!u) return null;
    const { heroStats, ...user } = u;
    return { userId, xp, totalXp: heroStats?.xp ?? 0, currentStreak: heroStats?.currentStreak ?? 0, user };
  };

  const top = sums.map((s) => toRow(s.userId, s.xp)).filter((r): r is LeaderboardRow => r !== null);
  if (inTop || mySum === null) return { top, me: null };

  const [higher] = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM (
      SELECT "userId" FROM "RewardEvent"
      WHERE "createdAt" >= ${periodStart}
      GROUP BY "userId"
      HAVING SUM("amount") > ${mySum}
    ) t
  `);
  const row = toRow(viewerId, mySum);
  return { top, me: row ? { rank: (higher?.count ?? 0) + 1, row } : null };
}

/** Admin "Reset now": starts a fresh period from this instant. */
export async function resetLeaderboardNow(admin: { id: string; firstName: string; lastName: string }) {
  const name = `${admin.firstName} ${admin.lastName}`.trim() || null;
  const reset = await db.leaderboardReset.create({ data: { resetById: admin.id, resetByName: name } });
  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: "LeaderboardReset", entityId: reset.id, metadata: { kind: "manual_reset" } },
  });
  return reset;
}
