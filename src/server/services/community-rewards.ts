import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { awardXp } from "@/lib/gamification/award-xp";
import { ACHIEVEMENT_CATALOG } from "@/lib/gamification/achievements-catalog";
import { HELPFUL_ANSWER_DAILY_CAP, HELPFUL_ANSWER_XP } from "@/lib/community/rules";
import { dhakaStartOfDay } from "@/lib/timezone";

// ---------------------------------------------------------------------
// Community rewards. They go through the LMS's own XP ledger (awardXp /
// RewardEvent) and achievement tables: there is no second economy.
//
// Deliberately few things earn anything. Posting, reacting, voting and
// following earn nothing, because each is free to repeat. What does earn
// XP is another person vouching for your work: the asker of a question
// marking your answer as the useful one.
// ---------------------------------------------------------------------

async function unlock(userId: string, key: string) {
  const def = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
  if (!def) return;
  // The common case by far: they already have it. One read, no write.
  const already = await db.userAchievement.findFirst({ where: { userId, achievement: { key } }, select: { id: true } });
  if (already) return;
  const fields = { name: def.name, description: def.description, iconKey: def.iconKey, xpBonus: def.xpBonus };
  const achievement = await db.achievement.upsert({ where: { key }, create: { key, ...fields }, update: fields });
  try {
    await db.userAchievement.create({ data: { userId, achievementId: achievement.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // already has it
    throw err;
  }
  if (def.xpBonus > 0) {
    await awardXp(userId, def.xpBonus, { type: "ACHIEVEMENT", id: achievement.id, rewardType: "ACHIEVEMENT_BONUS" });
  }
  await db.notification.create({
    data: {
      userId,
      type: "ACHIEVEMENT_UNLOCKED",
      title: `Achievement unlocked: ${def.name}`,
      body: def.description,
      linkUrl: "/achievements",
    },
  });
}

/**
 * Rewards the author of an answer that was just marked useful.
 *
 * - Never for your own question (the caller also refuses to accept it).
 * - Once per question: the ledger row is keyed by the question, so
 *   un-marking and re-marking, or switching to another answer by the same
 *   person, pays nothing more.
 * - At most HELPFUL_ANSWER_DAILY_CAP a day, so two accounts can't trade
 *   questions back and forth for XP.
 */
export async function rewardHelpfulAnswer(input: { questionId: string; askerId: string; answererId: string }) {
  if (input.askerId === input.answererId) return;

  const today = await db.rewardEvent.count({
    where: {
      userId: input.answererId,
      sourceType: "COMMUNITY_ANSWER",
      createdAt: { gte: dhakaStartOfDay() },
    },
  });
  if (today < HELPFUL_ANSWER_DAILY_CAP) {
    await awardXp(input.answererId, HELPFUL_ANSWER_XP, {
      type: "COMMUNITY_ANSWER",
      id: input.questionId,
      rewardType: "HELPFUL_ANSWER",
    });
  }

  const total = await db.communityPost.count({
    where: { kind: "QUESTION", acceptedComment: { authorId: input.answererId }, authorId: { not: input.answererId } },
  });
  if (total >= 1) await unlock(input.answererId, "community-first-helpful-answer");
  if (total >= 10) await unlock(input.answererId, "community-trusted-helper");
}

/** First post in the community: a welcome badge, no XP. */
export async function checkFirstPostAchievement(userId: string) {
  await unlock(userId, "community-first-post");
}
