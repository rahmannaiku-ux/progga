import { Prisma, type ExamIntegrityEventType } from "@prisma/client";
import { db } from "@/lib/db/client";
import { awardXp } from "@/lib/gamification/award-xp";
import { awardCoins } from "@/lib/gamification/coins";
import { checkEncounterAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import { gradeAutoGradableQuestion, isAutoGradable, isPassing, summarizeAttemptScore } from "@/lib/grading";
import {
  attemptDeadline,
  buildQuestionSnapshot,
  hasAnswerContent,
  isAttemptExpired,
  resolveQuestion,
  toGradable,
} from "@/lib/exam-attempt";
import { computeRisk } from "@/lib/exam-integrity";
import { createNotificationOnce } from "@/lib/notifications/dedupe";
import { getEncounterAchievementSignals } from "@/server/services/exam-analytics";

// ---------------------------------------------------------------------
// Closing and scoring an exam attempt.
//
// One place for it, because an attempt can end four ways: the student
// submits, the timer runs out with nobody on the page (expiry sweep), a
// mentor grades the written answers, or a mentor regrades / reopens /
// overturns. They all have to produce the same score and the same rewards.
// No session is read here; callers do their own permission checks.
// ---------------------------------------------------------------------

const QUESTION_INCLUDE = { options: { orderBy: { order: "asc" } } } as const;

/** Never throws: an integrity log failure must not break the exam. */
export async function logIntegrityEvent(
  attemptId: string,
  type: ExamIntegrityEventType,
  metadata?: Record<string, unknown>
) {
  try {
    await db.examIntegrityEvent.create({
      data: { attemptId, type, metadata: (metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull },
    });
  } catch {
    // Logging must never take down the exam experience.
  }
}

const RISK_COUNTER_SELECT = {
  tabSwitchCount: true,
  fullscreenExitCount: true,
  copyPasteCount: true,
  screenshotAttemptCount: true,
  sessionAnomalyCount: true,
  lockViolationCount: true,
  timeAnomalyCount: true,
  wasDisqualified: true,
} as const;

/** Re-derives riskLevel/riskReasons from the attempt's own counters. */
export async function recomputeRisk(attemptId: string) {
  const counters = await db.assessmentAttempt.findUnique({ where: { id: attemptId }, select: RISK_COUNTER_SELECT });
  if (!counters) return;
  const { level, reasons } = computeRisk(counters);
  await db.assessmentAttempt.update({ where: { id: attemptId }, data: { riskLevel: level, riskReasons: reasons } });
  return level;
}

type RewardInput = {
  attemptId: string;
  userId: string;
  isPassed: boolean;
  percentage: number;
  wasDisqualified: boolean;
  assessment: {
    id: string;
    kind: "QUIZ" | "EXAM";
    title: string;
    passPercentage: number;
    coinReward: number;
    minimumScoreForCoinReward: number | null;
  };
};

/**
 * XP, coins and achievements for a finished attempt. Safe to call again
 * for the same attempt (regrade, manual grading after auto grading): the
 * XP and coin ledgers each allow one row per source. A disqualified
 * attempt earns nothing.
 */
async function grantRewards(input: RewardInput) {
  if (input.wasDisqualified) return;
  const { assessment } = input;

  if (input.isPassed) {
    const rewardType = assessment.kind === "EXAM" ? "EXAM_PASSED" : "QUIZ_PASSED";
    await awardXp(input.userId, XP_REWARDS[rewardType], {
      type: "ASSESSMENT_ATTEMPT",
      id: input.attemptId,
      rewardType,
    });

    const coinThreshold = assessment.minimumScoreForCoinReward ?? assessment.passPercentage;
    if (assessment.coinReward > 0 && input.percentage >= coinThreshold) {
      await awardCoins(input.userId, assessment.coinReward, {
        type: "EXAM_REWARD",
        // Keyed by the exam, not the attempt: passing twice pays once.
        id: assessment.id,
        reason: assessment.title,
      });
    }
  }

  const signals = await getEncounterAchievementSignals(
    assessment.id,
    input.userId,
    input.attemptId,
    input.percentage
  );
  await checkEncounterAchievements(input.userId, {
    isPassed: input.isPassed,
    percentage: input.percentage,
    isNewPersonalBest: signals.isNewPersonalBest,
    percentileRank: signals.percentileRank,
  });
}

/**
 * Ends an in-progress attempt and grades everything that can be graded
 * automatically. Returns false when the attempt was not in progress (it
 * was already closed, or another request got there first).
 *
 * - `disqualified`: the attempt keeps its score but cannot pass or earn
 *   rewards. A mentor can overturn that later.
 * - `expired`: closed by the server after the time ran out, so the
 *   submit time is the deadline rather than whenever the sweep ran.
 */
export async function closeAttempt(
  attemptId: string,
  opts: { disqualified?: boolean; expired?: boolean } = {}
): Promise<boolean> {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true, answers: true },
  });
  if (!attempt || attempt.status !== "IN_PROGRESS") return false;

  // The claim is what makes this race-safe: two submits (double click, a
  // retry, the sweep and the student at once) both read IN_PROGRESS, but
  // only one flips it. Everyone else stops here, before grading or XP.
  const claim = await db.assessmentAttempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: { status: "GRADED" },
  });
  if (claim.count !== 1) return false;

  const { assessment } = attempt;
  const liveQuestions = await db.question.findMany({
    where: { id: { in: attempt.selectedQuestionIds } },
    include: QUESTION_INCLUDE,
  });
  const liveById = new Map(liveQuestions.map((q) => [q.id, q]));
  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const results: { pointsAwarded: number; questionPoints: number }[] = [];
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const now = new Date();
  let hasPendingManualReview = false;

  for (const questionId of attempt.selectedQuestionIds) {
    const answer = answersByQuestion.get(questionId) ?? null;
    // What the student saw when they first answered, else the question now.
    const question = resolveQuestion(answer?.questionSnapshot, liveById.get(questionId));
    if (!question) continue; // the question no longer exists and was never answered
    const snapshot = question as unknown as Prisma.InputJsonValue;
    const answered = hasAnswerContent(answer);

    let graded: { isCorrect: boolean | null; pointsAwarded: number | null; gradedAt: Date | null; isAutoGraded: boolean };
    if (!isAutoGradable(question.type)) {
      if (answered) {
        // ESSAY / SHORT_ANSWER with something written: waits for a mentor.
        hasPendingManualReview = true;
        graded = { isCorrect: null, pointsAwarded: null, gradedAt: null, isAutoGraded: false };
      } else {
        // Left blank: zero, and nothing for a mentor to do.
        graded = { isCorrect: false, pointsAwarded: 0, gradedAt: now, isAutoGraded: false };
      }
    } else {
      const result = gradeAutoGradableQuestion(toGradable(question), answer, assessment.negativeMarkingRatio);
      graded = { ...result, gradedAt: now, isAutoGraded: true };
    }
    results.push({ pointsAwarded: graded.pointsAwarded ?? 0, questionPoints: question.points });

    writes.push(
      answer
        ? db.questionAnswer.update({ where: { id: answer.id }, data: { ...graded, questionSnapshot: snapshot } })
        : db.questionAnswer.create({
            data: {
              attemptId,
              questionId,
              userId: attempt.userId,
              selectedOptionIds: [],
              questionSnapshot: snapshot,
              ...graded,
            },
          })
    );
  }
  if (writes.length > 0) await db.$transaction(writes);

  const { rawScore, maxScore, percentage } = summarizeAttemptScore(results);
  const deadline = attemptDeadline(attempt, assessment);
  const submittedAt = opts.expired && deadline && deadline < now ? deadline : now;
  const timeSpentSec = Math.max(0, Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));
  const wasDisqualified = Boolean(opts.disqualified) || attempt.wasDisqualified;
  const isPassed = hasPendingManualReview
    ? null
    : !wasDisqualified && isPassing(percentage, assessment.passPercentage);

  // "Answered everything implausibly fast" is a signal for the mentor,
  // never proof. Only meaningful with enough questions for an average.
  const questionCount = attempt.selectedQuestionIds.length;
  const answeredCount = attempt.answers.filter((a) => hasAnswerContent(a)).length;
  const timeAnomalyDetected = questionCount >= 5 && answeredCount > 0 && timeSpentSec / questionCount < 3;
  if (timeAnomalyDetected) {
    await logIntegrityEvent(attemptId, "TIME_ANOMALY", { timeSpentSec, questionCount });
  }

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      status: hasPendingManualReview ? "SUBMITTED" : "GRADED",
      submittedAt,
      timeSpentSec,
      rawScore,
      maxScore,
      percentage: hasPendingManualReview ? null : percentage,
      isPassed,
      wasDisqualified,
      timeAnomalyCount: timeAnomalyDetected ? { increment: 1 } : undefined,
    },
  });

  await logIntegrityEvent(attemptId, "EXAM_SUBMITTED", {
    disqualified: wasDisqualified,
    expired: Boolean(opts.expired),
  });
  await recomputeRisk(attemptId);

  if (!hasPendingManualReview) {
    await grantRewards({
      attemptId,
      userId: attempt.userId,
      isPassed: Boolean(isPassed),
      percentage,
      wasDisqualified,
      assessment,
    });
  }
  return true;
}

/**
 * Works out a finished attempt's final score from its answers, once no
 * written answer is still waiting for a mentor. Used after manual grading,
 * a regrade, and overturning a disqualification. Every question in the
 * attempt counts towards the maximum, answered or not.
 *
 * Returns "pending" when a written answer still needs grading.
 */
export async function settleAttempt(
  attemptId: string,
  opts: { notify?: boolean } = {}
): Promise<"settled" | "pending" | "skipped"> {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true, answers: true },
  });
  if (!attempt || (attempt.status !== "SUBMITTED" && attempt.status !== "GRADED")) return "skipped";

  const liveQuestions = await db.question.findMany({
    where: { id: { in: attempt.selectedQuestionIds } },
    include: QUESTION_INCLUDE,
  });
  const liveById = new Map(liveQuestions.map((q) => [q.id, q]));
  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const results: { pointsAwarded: number; questionPoints: number }[] = [];
  for (const questionId of attempt.selectedQuestionIds) {
    const answer = answersByQuestion.get(questionId) ?? null;
    const question = resolveQuestion(answer?.questionSnapshot, liveById.get(questionId));
    if (!question) continue;
    if (!isAutoGradable(question.type) && hasAnswerContent(answer) && answer?.gradedAt == null) return "pending";
    results.push({ pointsAwarded: answer?.pointsAwarded ?? 0, questionPoints: question.points });
  }

  const { rawScore, maxScore, percentage } = summarizeAttemptScore(results);
  const isPassed = !attempt.wasDisqualified && isPassing(percentage, attempt.assessment.passPercentage);

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { status: "GRADED", rawScore, maxScore, percentage, isPassed },
  });

  if (opts.notify) {
    // Once per attempt: re-grading an answer must not notify again.
    await createNotificationOnce("GRADE_POSTED", {
      userId: attempt.userId,
      title: "Exam graded",
      body: `Your result for "${attempt.assessment.title}" is ready: ${Math.round(percentage)}%.`,
      linkUrl: `/results/${attemptId}`,
    });
  }

  await grantRewards({
    attemptId,
    userId: attempt.userId,
    isPassed,
    percentage,
    wasDisqualified: attempt.wasDisqualified,
    assessment: attempt.assessment,
  });
  return "settled";
}

/**
 * Re-marks every auto-graded answer of an exam's finished attempts
 * against the questions as they are NOW (after a mentor fixed an answer
 * key), then recomputes each score. Mentor-given marks on written answers
 * are kept, capped at the question's current points.
 */
export async function regradeAssessment(assessmentId: string): Promise<{ attempts: number; changed: number }> {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { negativeMarkingRatio: true },
  });
  if (!assessment) return { attempts: 0, changed: 0 };

  const attempts = await db.assessmentAttempt.findMany({
    where: { assessmentId, status: { in: ["SUBMITTED", "GRADED"] } },
    include: { answers: true },
  });
  const questionIds = [...new Set(attempts.flatMap((a) => a.selectedQuestionIds))];
  const liveQuestions = await db.question.findMany({ where: { id: { in: questionIds } }, include: QUESTION_INCLUDE });
  const liveById = new Map(liveQuestions.map((q) => [q.id, q]));

  let changed = 0;
  for (const attempt of attempts) {
    const before = { percentage: attempt.percentage, isPassed: attempt.isPassed };
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const answer of attempt.answers) {
      const live = liveById.get(answer.questionId);
      if (!live) continue;
      const question = buildQuestionSnapshot(live);
      const snapshot = question as unknown as Prisma.InputJsonValue;
      if (isAutoGradable(question.type)) {
        const result = gradeAutoGradableQuestion(toGradable(question), answer, assessment.negativeMarkingRatio);
        writes.push(
          db.questionAnswer.update({
            where: { id: answer.id },
            data: { ...result, isAutoGraded: true, gradedAt: new Date(), questionSnapshot: snapshot },
          })
        );
      } else {
        writes.push(
          db.questionAnswer.update({
            where: { id: answer.id },
            data: {
              questionSnapshot: snapshot,
              pointsAwarded: answer.pointsAwarded == null ? undefined : Math.min(answer.pointsAwarded, question.points),
            },
          })
        );
      }
    }
    if (writes.length > 0) await db.$transaction(writes);
    await settleAttempt(attempt.id);
    const after = await db.assessmentAttempt.findUnique({
      where: { id: attempt.id },
      select: { percentage: true, isPassed: true },
    });
    if (after && (after.percentage !== before.percentage || after.isPassed !== before.isPassed)) changed++;
  }
  return { attempts: attempts.length, changed };
}

/**
 * Closes in-progress attempts whose time ran out while nobody had the
 * page open, so they get a score instead of staying "in progress" for
 * good. Scope it to one student or one exam from a page, or leave it
 * open for the cron sweep.
 */
export async function closeExpiredAttempts(
  scope: { userId?: string; assessmentId?: string } = {},
  now: Date = new Date()
): Promise<number> {
  const candidates = await db.assessmentAttempt.findMany({
    where: {
      status: "IN_PROGRESS",
      ...(scope.userId ? { userId: scope.userId } : {}),
      ...(scope.assessmentId ? { assessmentId: scope.assessmentId } : {}),
      assessment: { autoSubmitOnExpiry: true, timeLimitSeconds: { not: null } },
    },
    select: {
      id: true,
      startedAt: true,
      extraTimeSeconds: true,
      assessment: { select: { timeLimitSeconds: true, autoSubmitOnExpiry: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 500,
  });

  let closed = 0;
  for (const attempt of candidates) {
    if (!isAttemptExpired(attempt, attempt.assessment, now)) continue;
    if (await closeAttempt(attempt.id, { expired: true })) closed++;
  }
  return closed;
}

/**
 * Finishes attempts stuck at "awaiting review" with no written answer
 * left to review (the student left every written question blank, so the
 * grading queue has nothing to grade for them).
 */
export async function settleStuckAttempts(): Promise<number> {
  const stuck = await db.assessmentAttempt.findMany({
    where: {
      status: "SUBMITTED",
      answers: {
        none: { isAutoGraded: false, gradedAt: null, AND: [{ textAnswer: { not: null } }, { textAnswer: { not: "" } }] },
      },
    },
    select: { id: true },
    take: 200,
  });
  let settled = 0;
  for (const attempt of stuck) {
    if ((await settleAttempt(attempt.id, { notify: true })) === "settled") settled++;
  }
  return settled;
}
