import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/** GET /api/bot/achievements?userId=... */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const unlocked = await db.userAchievement.findMany({
    where: { userId: user!.id },
    orderBy: { unlockedAt: "desc" },
    select: {
      unlockedAt: true,
      achievement: { select: { key: true, name: true, description: true, iconKey: true, xpBonus: true } },
    },
  });

  return NextResponse.json(unlocked.map((u) => ({ ...u.achievement, unlockedAt: u.unlockedAt })));
}
