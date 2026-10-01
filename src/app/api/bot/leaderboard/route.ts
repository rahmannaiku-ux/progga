import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { levelForXp } from "@/lib/gamification/xp-curve";
import { getLeaderboard, getLeaderboardPeriod } from "@/lib/gamification/leaderboard";

const TOP = 10;

/**
 * GET /api/bot/leaderboard?userId=...
 * The same board as the website (this period's XP, or all time when it never resets):
 * the top Heroes and where the asking hero stands.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const period = await getLeaderboardPeriod();
  const { top, me } = await getLeaderboard(period.start, user!.id, TOP);
  const toRow = (rank: number, r: (typeof top)[number]) => ({
    rank,
    userId: r.userId,
    name: `${r.user.firstName} ${r.user.lastName}`.trim(),
    xp: r.xp,
    level: levelForXp(r.totalXp),
    streakDays: r.currentStreak,
  });

  return NextResponse.json({
    schedule: period.schedule,
    periodStart: period.start,
    top: top.map((r, i) => toRow(i + 1, r)),
    me: me ? toRow(me.rank, me.row) : null,
  });
}
