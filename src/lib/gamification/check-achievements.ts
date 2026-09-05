import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ACHIEVEMENT_CATALOG } from "@/lib/gamification/achievements-catalog";

async function ensureAchievementRow(key: string) {
  const def = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
  if (!def) throw new Error(`Unknown achievement key: ${key}`);
  const dbFields = { name: def.name, description: def.description, iconKey: def.iconKey, xpBonus: def.xpBonus };
  return db.achievement.upsert({
    where: { key },
    create: { key, ...dbFields },
    update: dbFields,
  });
}

async function unlock(userId: string, key: string) {
  const already = await db.userAchievement.findFirst({
    where: { userId, achievement: { key } },
  });
  if (already) return false;

  const achievement = await ensureAchievementRow(key);

  try {
    await db.userAchievement.create({ data: { userId, achievementId: achievement.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Another concurrent check for this same user/achievement won the
      // race between the findFirst above and this create — already
      // unlocked, not an error. Same guard as awardXp's own duplicate-
      // award race.
      return false;
    }
    throw err;
  }

  if (achievement.xpBonus > 0) {
    await db.heroStats.update({
      where: { userId },
      data: { xp: { increment: achievement.xpBonus } },
    });
  }

  await db.notification.create({
    data: {
      userId,
      type: "ACHIEVEMENT_UNLOCKED",
      title: `Achievement unlocked: ${achievement.name}`,
      body: achievement.description,
      linkUrl: "/achievements",
    },
  });

  return true;
}

/** Call after a lesson is marked complete. */
export async function checkLessonCompletionAchievements(userId: string) {
  const completedCount = await db.lessonProgress.count({ where: { userId, isCompleted: true } });
  if (completedCount >= 1) await unlock(userId, "first-patrol");
}

/** Call after an enrollment transitions to COMPLETED. */
export async function checkMissionCompletionAchievements(userId: string) {
  const completedCount = await db.enrollment.count({ where: { userId, status: "COMPLETED" } });
  if (completedCount >= 1) await unlock(userId, "first-mission-complete");
  if (completedCount >= 5) await unlock(userId, "five-missions-complete");
}

/** Call after an assessment attempt is graded (auto or manual). */
export async function checkEncounterAchievements(
  userId: string,
  result: {
    isPassed: boolean | null;
    percentage: number | null;
    isNewPersonalBest?: boolean;
    percentileRank?: number | null;
  }
) {
  if (result.isPassed) await unlock(userId, "first-encounter-passed");
  if (result.percentage === 100) await unlock(userId, "perfect-encounter");
  if (result.isNewPersonalBest) await unlock(userId, "personal-best");
  if (result.percentileRank !== null && result.percentileRank !== undefined && result.percentileRank >= 90) {
    await unlock(userId, "top-decile-encounter");
  }
}

/** Call after an assignment submission is graded. */
export async function checkAssignmentAchievements(userId: string) {
  await unlock(userId, "first-challenge-graded");
}

/** Call after the daily streak is recalculated. */
export async function checkStreakAchievements(userId: string, currentStreak: number) {
  if (currentStreak >= 7) await unlock(userId, "streak-7");
  if (currentStreak >= 30) await unlock(userId, "streak-30");
  if (currentStreak >= 100) await unlock(userId, "streak-100");
}

/** Call after XP/level changes. */
export async function checkLevelAchievements(userId: string, level: number) {
  if (level >= 10) await unlock(userId, "level-10");
  if (level >= 25) await unlock(userId, "level-25");
}
