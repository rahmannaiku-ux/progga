import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { levelForXp, XP_REWARDS } from "@/lib/gamification/xp-curve";
import {
  checkLevelAchievements,
  checkStreakAchievements,
} from "@/lib/gamification/check-achievements";
import { dhakaDateKey } from "@/lib/timezone";

/**
 * Awards XP exactly once per (sourceType, sourceId, rewardType, userId).
 * The idempotency guarantee comes from RewardEvent's unique constraint,
 * not from an "if not already awarded" check in application code — a
 * check-then-act guard here would have exactly the same TOCTOU race as
 * the one that let exam submissions double-award XP (see
 * submitAttempt in attempt-actions.ts). A duplicate call — retry,
 * double-click, concurrent request, re-grading the same submission —
 * hits the unique constraint, and this function treats that as "already
 * awarded" and returns without touching HeroStats.
 *
 * `source` is required so every call site has to say what this XP is
 * *for* — that's what the ledger keys on. There is deliberately no
 * "just award some XP with no source" escape hatch.
 */
export async function awardXp(
  userId: string,
  amount: number,
  source: { type: string; id: string; rewardType: string }
) {
  // The ledger row and the XP increment commit together. Before, the
  // ledger insert happened first and the increment second, so a failure in
  // between (DB hiccup, deploy restart) left a RewardEvent behind with no
  // XP granted — and the unique constraint then made every retry a no-op,
  // so that XP was lost for good.
  let stats;
  try {
    stats = await db.$transaction(async (tx) => {
      await tx.rewardEvent.create({
        data: {
          userId,
          sourceType: source.type,
          sourceId: source.id,
          rewardType: source.rewardType,
          amount,
        },
      });
      return tx.heroStats.upsert({
        where: { userId },
        create: { userId, xp: amount },
        update: { xp: { increment: amount } },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return; // already awarded for this exact source — no-op, not an error
    }
    throw err;
  }

  const newLevel = levelForXp(stats.xp);
  if (newLevel !== stats.level) {
    await db.heroStats.update({ where: { userId }, data: { level: newLevel } });
    if (newLevel > stats.level) {
      await db.notification.create({
        data: {
          userId,
          type: "ACHIEVEMENT_UNLOCKED",
          title: `Level up! You're now level ${newLevel}`,
          body: "Keep going — your next level is already within reach.",
          linkUrl: "/profile",
        },
      });
      await checkLevelAchievements(userId, newLevel);
    }
  }
}

/** Kept for backward compatibility with Phase 5/6/7 call sites. */
export async function awardLessonCompletionXp(userId: string, lessonId: string) {
  await awardXp(userId, XP_REWARDS.LESSON_COMPLETE, {
    type: "LESSON",
    id: lessonId,
    rewardType: "LESSON_COMPLETE",
  });
}

/** Updates the daily streak: +1 if the last activity was yesterday,
 * reset to 1 if it's been longer, unchanged if already logged today. */
export async function updateStreak(userId: string) {
  const stats = await db.heroStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  // Bangladesh calendar day, not the server's local day — Vercel
  // functions run in UTC regardless of region, so a plain
  // `new Date(); setHours(0,0,0,0)` here would mark "today" using
  // UTC's midnight, up to 6 hours off from Dhaka's. See dhakaDateKey's
  // comment in lib/timezone.ts.
  const today = new Date(`${dhakaDateKey(new Date())}T00:00:00+06:00`);
  const last = stats.lastActivityDate
    ? new Date(`${dhakaDateKey(stats.lastActivityDate)}T00:00:00+06:00`)
    : null;

  let currentStreak = stats.currentStreak;
  if (!last) {
    currentStreak = 1;
  } else {
    const dayDiff = Math.round((today.getTime() - last.getTime()) / 86_400_000);
    if (dayDiff === 1) currentStreak += 1;
    else if (dayDiff > 1) currentStreak = 1;
    // dayDiff === 0: already logged today, streak unchanged
  }

  await db.heroStats.update({
    where: { userId },
    data: {
      currentStreak,
      longestStreak: Math.max(currentStreak, stats.longestStreak),
      lastActivityDate: today,
    },
  });

  await checkStreakAchievements(userId, currentStreak);
}
