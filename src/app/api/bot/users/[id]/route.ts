import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botUserSelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";

/**
 * GET /api/bot/users/:id
 * This is the endpoint the bot's ProggaaUserService.getRole() calls on
 * every single update — it must always reflect the current role, never
 * a cached one (a website-side role change should apply on the bot
 * immediately, matching src/bot/middleware/auth.ts's own contract).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(params.id);
  if (error) return error;

  const full = await db.user.findUnique({
    where: { id: user!.id },
    select: {
      ...botUserSelect,
      heroStats: { select: { xp: true, currentStreak: true, coinBalance: true } },
    },
  });
  if (!full) return NextResponse.json(null, { status: 404 });

  // The level curve lives in one place (lib/gamification/xp-curve.ts); the bot
  // just shows what this returns instead of re-implementing it.
  const { heroStats, ...rest } = full;
  const xp = heroStats?.xp ?? 0;
  const progress = xpProgressWithinLevel(xp);
  return NextResponse.json({
    ...rest,
    xp,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    streakDays: heroStats?.currentStreak ?? 0,
    coinBalance: heroStats?.coinBalance ?? 0,
  });
}
