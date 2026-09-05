import { db } from "@/lib/db/client";

// Below this many other graded participants, percentile/average/distribution
// numbers are noisy AND could effectively de-anonymize a classmate's score
// (e.g. "average" of 2 people reveals the other person's exact score). We
// simply don't show comparison data until there's a reasonable-sized cohort.
const MIN_PARTICIPANTS_FOR_COMPARISON = 5;

export type ScoreBucket = { label: string; count: number; isYours: boolean };

export type QuestionDifficulty = {
  questionId: string;
  prompt: string;
  order: number;
  topic: string | null;
  correctPct: number; // % of all participants who answered this correctly
  youCorrect: boolean | null; // null = not auto-graded, or you didn't answer
};

export type TopicPerformance = {
  topic: string;
  correctPct: number; // class-wide correct rate for this topic
  yourCorrectPct: number | null; // your own correct rate for this topic, null if you had no auto-graded questions in it
  questionCount: number;
};

export type AssessmentAnalytics =
  | { available: false; participantCount: number; minRequired: number }
  | {
      available: true;
      participantCount: number;
      yourPercentage: number;
      yourRawScore: number;
      yourMaxScore: number;
      average: number;
      median: number;
      highest: number;
      lowest: number;
      percentileRank: number; // "you scored better than or equal to N% of the cohort"
      passRatePct: number;
      yourTimeSpentSec: number | null;
      averageTimeSpentSec: number | null;
      distribution: ScoreBucket[];
      toughestQuestions: QuestionDifficulty[];
      weakTopics: TopicPerformance[];
      previousBestPercentage: number | null; // your best percentage on any EARLIER graded attempt
    };

/**
 * Peer-comparison analytics for a single assessment, scoped to one student.
 *
 * Compares each student's BEST graded attempt (not every retry — otherwise
 * someone who retook the exam five times would skew the average/distribution
 * against people who only got one attempt). Only ever returns aggregates —
 * no other student's name, id, or individual score is exposed.
 */
export async function getAssessmentAnalytics(
  assessmentId: string,
  currentUserId: string
): Promise<AssessmentAnalytics> {
  const gradedAttempts = await db.assessmentAttempt.findMany({
    where: { assessmentId, status: "GRADED", percentage: { not: null } },
    select: {
      id: true,
      userId: true,
      percentage: true,
      rawScore: true,
      maxScore: true,
      timeSpentSec: true,
      isPassed: true,
      submittedAt: true,
    },
  });

  const bestByUser = new Map<string, (typeof gradedAttempts)[number]>();
  for (const attempt of gradedAttempts) {
    const existing = bestByUser.get(attempt.userId);
    if (!existing || (attempt.percentage ?? 0) > (existing.percentage ?? 0)) {
      bestByUser.set(attempt.userId, attempt);
    }
  }

  const rows = [...bestByUser.values()];
  const participantCount = rows.length;
  const yours = bestByUser.get(currentUserId);

  if (!yours || participantCount < MIN_PARTICIPANTS_FOR_COMPARISON) {
    return {
      available: false,
      participantCount,
      minRequired: MIN_PARTICIPANTS_FOR_COMPARISON,
    };
  }

  const percentages = rows.map((r) => r.percentage!).sort((a, b) => a - b);
  const average = percentages.reduce((s, p) => s + p, 0) / participantCount;
  const mid = Math.floor(participantCount / 2);
  const median =
    participantCount % 2 === 0
      ? (percentages[mid - 1]! + percentages[mid]!) / 2
      : percentages[mid]!;
  const highest = percentages[percentages.length - 1]!;
  const lowest = percentages[0]!;

  const passCount = rows.filter((r) => r.isPassed).length;
  const passRatePct = Math.round((passCount / participantCount) * 100);

  const atOrBelowYou = rows.filter((r) => (r.percentage ?? 0) <= yours.percentage!).length;
  const percentileRank = Math.round((atOrBelowYou / participantCount) * 100);

  const withTime = rows.filter((r) => r.timeSpentSec != null);
  const averageTimeSpentSec =
    withTime.length > 0
      ? Math.round(withTime.reduce((s, r) => s + (r.timeSpentSec ?? 0), 0) / withTime.length)
      : null;

  const bucketDefs = [
    { label: "0-59", min: 0, max: 60 },
    { label: "60-69", min: 60, max: 70 },
    { label: "70-79", min: 70, max: 80 },
    { label: "80-89", min: 80, max: 90 },
    { label: "90-100", min: 90, max: 101 },
  ];
  const distribution: ScoreBucket[] = bucketDefs.map((b) => ({
    label: b.label,
    count: rows.filter((r) => (r.percentage ?? 0) >= b.min && (r.percentage ?? 0) < b.max).length,
    isYours: (yours.percentage ?? 0) >= b.min && (yours.percentage ?? 0) < b.max,
  }));

  // Question-level difficulty, built only from each student's best attempt,
  // so it lines up with the score/percentile numbers above.
  const bestAttemptIds = rows.map((r) => r.id);
  const [questionLinks, allAnswers, yourAnswers] = await Promise.all([
    db.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { order: "asc" },
      select: { order: true, question: { select: { id: true, prompt: true, topic: true } } },
    }),
    db.questionAnswer.findMany({
      where: { attemptId: { in: bestAttemptIds }, isAutoGraded: true, isCorrect: { not: null } },
      select: { questionId: true, isCorrect: true },
    }),
    db.questionAnswer.findMany({
      where: { attemptId: yours.id },
      select: { questionId: true, isCorrect: true },
    }),
  ]);
  const questions = questionLinks.map((l) => ({ ...l.question, order: l.order }));

  const statsByQuestion = new Map<string, { correct: number; total: number }>();
  for (const a of allAnswers) {
    const entry = statsByQuestion.get(a.questionId) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    statsByQuestion.set(a.questionId, entry);
  }
  const yourAnswerMap = new Map(yourAnswers.map((a) => [a.questionId, a.isCorrect]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  const toughestQuestions: QuestionDifficulty[] = questions
    .map((q): QuestionDifficulty | null => {
      const stats = statsByQuestion.get(q.id);
      if (!stats || stats.total === 0) return null;
      return {
        questionId: q.id,
        prompt: q.prompt,
        order: q.order,
        topic: q.topic,
        correctPct: Math.round((stats.correct / stats.total) * 100),
        youCorrect: yourAnswerMap.get(q.id) ?? null,
      };
    })
    .filter((q): q is QuestionDifficulty => q !== null)
    .sort((a, b) => a.correctPct - b.correctPct)
    .slice(0, 5);

  // Topic rollup — only for questions mentors bothered to tag with a topic.
  // Class-wide correct rate per topic vs. the student's own correct rate in
  // that same topic, so a student can see "you're weak in Recursion" rather
  // than just a list of individual question prompts.
  const topicAgg = new Map<string, { classCorrect: number; classTotal: number; yourCorrect: number; yourTotal: number }>();
  for (const a of allAnswers) {
    const q = questionsById.get(a.questionId);
    if (!q?.topic) continue;
    const entry = topicAgg.get(q.topic) ?? { classCorrect: 0, classTotal: 0, yourCorrect: 0, yourTotal: 0 };
    entry.classTotal += 1;
    if (a.isCorrect) entry.classCorrect += 1;
    topicAgg.set(q.topic, entry);
  }
  for (const a of yourAnswers) {
    const q = questionsById.get(a.questionId);
    if (!q?.topic || a.isCorrect === null) continue;
    const entry = topicAgg.get(q.topic);
    if (!entry) continue;
    entry.yourTotal += 1;
    if (a.isCorrect) entry.yourCorrect += 1;
  }

  const weakTopics: TopicPerformance[] = [...topicAgg.entries()]
    .map(([topic, s]) => ({
      topic,
      correctPct: s.classTotal > 0 ? Math.round((s.classCorrect / s.classTotal) * 100) : 0,
      yourCorrectPct: s.yourTotal > 0 ? Math.round((s.yourCorrect / s.yourTotal) * 100) : null,
      questionCount: questions.filter((q) => q.topic === topic).length,
    }))
    .sort((a, b) => (a.yourCorrectPct ?? 101) - (b.yourCorrectPct ?? 101))
    .slice(0, 5);

  // "Improved since last time" — best percentage from any earlier GRADED
  // attempt (strictly before this one), so a retry can show a delta.
  const earlierAttempts = gradedAttempts.filter(
    (a) => a.userId === currentUserId && a.id !== yours.id && a.submittedAt && yours.submittedAt && a.submittedAt < yours.submittedAt
  );
  const previousBestPercentage =
    earlierAttempts.length > 0
      ? Math.max(...earlierAttempts.map((a) => a.percentage ?? 0))
      : null;

  return {
    available: true,
    participantCount,
    yourPercentage: yours.percentage!,
    yourRawScore: yours.rawScore ?? 0,
    yourMaxScore: yours.maxScore ?? 0,
    average: Math.round(average * 10) / 10,
    median: Math.round(median * 10) / 10,
    highest,
    lowest,
    percentileRank,
    passRatePct,
    yourTimeSpentSec: yours.timeSpentSec,
    averageTimeSpentSec,
    distribution,
    toughestQuestions,
    weakTopics,
    previousBestPercentage,
  };
}

export type MentorQuestionStat = {
  questionId: string;
  prompt: string;
  order: number;
  topic: string | null;
  correctPct: number;
  responseCount: number;
};

export type MentorTopicStat = {
  topic: string;
  correctPct: number;
  questionCount: number;
};

export type MentorAssessmentAnalytics =
  | { available: false; participantCount: number; minRequired: number }
  | {
      available: true;
      participantCount: number;
      average: number;
      median: number;
      highest: number;
      lowest: number;
      passRatePct: number;
      averageTimeSpentSec: number | null;
      distribution: ScoreBucket[];
      questionStats: MentorQuestionStat[]; // every auto-graded question, hardest first
      topicStats: MentorTopicStat[]; // every tagged topic, hardest first
    };

/**
 * Class-wide analytics for a mentor grading an assessment — same underlying
 * numbers as the student-facing view, but without a "yours" perspective
 * (mentors don't take the exam) and with the FULL question/topic list
 * rather than just the top 5 trickiest, since a mentor deciding what to
 * re-teach needs the complete picture.
 */
export async function getMentorAssessmentAnalytics(
  assessmentId: string
): Promise<MentorAssessmentAnalytics> {
  const gradedAttempts = await db.assessmentAttempt.findMany({
    where: { assessmentId, status: "GRADED", percentage: { not: null } },
    select: {
      id: true,
      userId: true,
      percentage: true,
      timeSpentSec: true,
      isPassed: true,
    },
  });

  const bestByUser = new Map<string, (typeof gradedAttempts)[number]>();
  for (const attempt of gradedAttempts) {
    const existing = bestByUser.get(attempt.userId);
    if (!existing || (attempt.percentage ?? 0) > (existing.percentage ?? 0)) {
      bestByUser.set(attempt.userId, attempt);
    }
  }
  const rows = [...bestByUser.values()];
  const participantCount = rows.length;

  if (participantCount < MIN_PARTICIPANTS_FOR_COMPARISON) {
    return {
      available: false,
      participantCount,
      minRequired: MIN_PARTICIPANTS_FOR_COMPARISON,
    };
  }

  const percentages = rows.map((r) => r.percentage!).sort((a, b) => a - b);
  const average = percentages.reduce((s, p) => s + p, 0) / participantCount;
  const mid = Math.floor(participantCount / 2);
  const median =
    participantCount % 2 === 0
      ? (percentages[mid - 1]! + percentages[mid]!) / 2
      : percentages[mid]!;
  const highest = percentages[percentages.length - 1]!;
  const lowest = percentages[0]!;
  const passRatePct = Math.round(
    (rows.filter((r) => r.isPassed).length / participantCount) * 100
  );
  const withTime = rows.filter((r) => r.timeSpentSec != null);
  const averageTimeSpentSec =
    withTime.length > 0
      ? Math.round(withTime.reduce((s, r) => s + (r.timeSpentSec ?? 0), 0) / withTime.length)
      : null;

  const bucketDefs = [
    { label: "0-59", min: 0, max: 60 },
    { label: "60-69", min: 60, max: 70 },
    { label: "70-79", min: 70, max: 80 },
    { label: "80-89", min: 80, max: 90 },
    { label: "90-100", min: 90, max: 101 },
  ];
  const distribution: ScoreBucket[] = bucketDefs.map((b) => ({
    label: b.label,
    count: rows.filter((r) => (r.percentage ?? 0) >= b.min && (r.percentage ?? 0) < b.max).length,
    isYours: false,
  }));

  const bestAttemptIds = rows.map((r) => r.id);
  const [questionLinks, allAnswers] = await Promise.all([
    db.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { order: "asc" },
      select: { order: true, question: { select: { id: true, prompt: true, topic: true } } },
    }),
    db.questionAnswer.findMany({
      where: { attemptId: { in: bestAttemptIds }, isAutoGraded: true, isCorrect: { not: null } },
      select: { questionId: true, isCorrect: true },
    }),
  ]);
  const questions = questionLinks.map((l) => ({ ...l.question, order: l.order }));

  const statsByQuestion = new Map<string, { correct: number; total: number }>();
  for (const a of allAnswers) {
    const entry = statsByQuestion.get(a.questionId) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    statsByQuestion.set(a.questionId, entry);
  }

  const questionStats: MentorQuestionStat[] = questions
    .map((q): MentorQuestionStat | null => {
      const stats = statsByQuestion.get(q.id);
      if (!stats || stats.total === 0) return null;
      return {
        questionId: q.id,
        prompt: q.prompt,
        order: q.order,
        topic: q.topic,
        correctPct: Math.round((stats.correct / stats.total) * 100),
        responseCount: stats.total,
      };
    })
    .filter((q): q is MentorQuestionStat => q !== null)
    .sort((a, b) => a.correctPct - b.correctPct);

  const topicAgg = new Map<string, { correct: number; total: number; questionCount: number }>();
  for (const q of questions) {
    if (!q.topic) continue;
    if (!topicAgg.has(q.topic)) topicAgg.set(q.topic, { correct: 0, total: 0, questionCount: 0 });
    topicAgg.get(q.topic)!.questionCount += 1;
  }
  for (const a of allAnswers) {
    const q = questions.find((q) => q.id === a.questionId);
    if (!q?.topic) continue;
    const entry = topicAgg.get(q.topic)!;
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
  }
  const topicStats: MentorTopicStat[] = [...topicAgg.entries()]
    .filter(([, s]) => s.total > 0)
    .map(([topic, s]) => ({
      topic,
      correctPct: Math.round((s.correct / s.total) * 100),
      questionCount: s.questionCount,
    }))
    .sort((a, b) => a.correctPct - b.correctPct);

  return {
    available: true,
    participantCount,
    average: Math.round(average * 10) / 10,
    median: Math.round(median * 10) / 10,
    highest,
    lowest,
    passRatePct,
    averageTimeSpentSec,
    distribution,
    questionStats,
    topicStats,
  };
}

/**
 * A student's percentage history across every GRADED attempt they've ever
 * made, across all assessments — used to draw a trend line on their
 * profile ("are my scores improving over time"). Ordered oldest → newest.
 */
export async function getStudentScoreTrend(userId: string, limit = 20) {
  const attempts = await db.assessmentAttempt.findMany({
    where: { userId, status: "GRADED", percentage: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: limit,
    select: {
      id: true,
      percentage: true,
      submittedAt: true,
      isPassed: true,
      assessment: { select: { title: true, kind: true } },
    },
  });
  return attempts.reverse(); // oldest first, easier to plot left-to-right
}

// Cohort size below which a percentile-based achievement wouldn't mean much
// (and could de-anonymize a small class) — mirrors MIN_PARTICIPANTS_FOR_COMPARISON.
const MIN_PARTICIPANTS_FOR_TOP_DECILE = 5;

/**
 * Lightweight signals used right after grading to decide whether to unlock
 * the "Personal Best" or "Top of the Class" achievements. Deliberately
 * narrower than getAssessmentAnalytics — it only needs two numbers, not
 * the full distribution/topic breakdown, so it stays cheap to run on every
 * single submission.
 */
export async function getEncounterAchievementSignals(
  assessmentId: string,
  userId: string,
  currentAttemptId: string,
  currentPercentage: number
) {
  const gradedAttempts = await db.assessmentAttempt.findMany({
    where: { assessmentId, status: "GRADED", percentage: { not: null } },
    select: { id: true, userId: true, percentage: true },
  });

  const bestByUser = new Map<string, number>();
  for (const a of gradedAttempts) {
    if (a.id === currentAttemptId) continue; // exclude the attempt we're currently grading
    const existing = bestByUser.get(a.userId);
    if (existing === undefined || (a.percentage ?? 0) > existing) {
      bestByUser.set(a.userId, a.percentage ?? 0);
    }
  }

  const previousBest = bestByUser.get(userId) ?? null;
  const isNewPersonalBest = previousBest !== null && currentPercentage > previousBest;

  // Percentile among every user's best attempt, counting this one for the
  // current user.
  const bestsIncludingCurrent = new Map(bestByUser);
  bestsIncludingCurrent.set(userId, Math.max(previousBest ?? -Infinity, currentPercentage));
  const allBests = [...bestsIncludingCurrent.values()];
  const participantCount = allBests.length;
  const percentileRank =
    participantCount >= MIN_PARTICIPANTS_FOR_TOP_DECILE
      ? Math.round((allBests.filter((p) => p <= currentPercentage).length / participantCount) * 100)
      : null;

  return { isNewPersonalBest, previousBest, percentileRank, participantCount };
}

// ---------------------------------------------------------------------
// EXAM INTEGRITY & SECURITY — teacher-facing analytics.
//
// Kept in this file rather than a new service module: it's the same
// "read-only, per-assessment/per-attempt teacher analytics" concern as
// everything above it, just for integrity signals instead of scores.
// ---------------------------------------------------------------------

import { RISK_LEVEL_LABEL } from "@/lib/exam-integrity";

export type TimelineEntry = {
  at: Date;
  label: string;
  kind: "integrity" | "answer";
};

// Caps how many raw integrity events feed the timeline. Window
// blur/focus in particular can fire more often than the other event
// types on a flaky window manager or multi-monitor setup, so without a
// ceiling a single pathological attempt could return thousands of rows
// and make the investigate page slow to render. Most recent events are
// kept (an old TAB_SWITCH from minute 2 of a 3-hour exam matters far
// less than what just happened).
const TIMELINE_EVENT_LIMIT = 500;

/**
 * PHASE 15 — chronological merge of every integrity event AND every
 * accepted answer change for one attempt, into a single human-readable
 * timeline. Rejected (locked) changes already exist as
 * ANSWER_CHANGE_ATTEMPT integrity events, so they show up automatically
 * without double-counting anything from changeHistory.
 */
export async function getAttemptTimeline(
  attemptId: string
): Promise<{ entries: TimelineEntry[]; truncated: boolean }> {
  const [events, totalEventCount, answers] = await Promise.all([
    db.examIntegrityEvent.findMany({
      where: { attemptId },
      orderBy: { createdAt: "desc" },
      take: TIMELINE_EVENT_LIMIT,
    }),
    db.examIntegrityEvent.count({ where: { attemptId } }),
    db.questionAnswer.findMany({
      where: { attemptId },
      include: { question: { select: { prompt: true } } },
    }),
  ]);

  const entries: TimelineEntry[] = events.map((e) => ({
    at: e.createdAt,
    kind: "integrity",
    label: describeIntegrityEvent(e.type, e.metadata as Record<string, unknown> | null),
  }));

  for (const answer of answers) {
    const history = Array.isArray(answer.changeHistory) ? (answer.changeHistory as any[]) : [];
    for (const entry of history) {
      if (!entry?.at) continue;
      entries.push({
        at: new Date(entry.at),
        kind: "answer",
        label: `Answered "${answer.question.prompt.slice(0, 40)}${answer.question.prompt.length > 40 ? "…" : ""}"`,
      });
    }
  }

  return {
    entries: entries.sort((a, b) => a.at.getTime() - b.at.getTime()),
    truncated: totalEventCount > TIMELINE_EVENT_LIMIT,
  };
}

function describeIntegrityEvent(type: string, metadata: Record<string, unknown> | null): string {
  switch (type) {
    case "EXAM_STARTED":
      return "Exam started";
    case "EXAM_SUBMITTED":
      return "Exam submitted";
    case "TAB_SWITCH":
      return `Tab switched (#${metadata?.tabSwitchCount ?? "?"})`;
    case "WINDOW_BLUR":
      return "Window lost focus";
    case "WINDOW_FOCUS":
      return "Window regained focus";
    case "FULLSCREEN_ENTER":
      return "Entered fullscreen";
    case "FULLSCREEN_EXIT":
      return "Exited fullscreen";
    case "ANSWER_CHANGE_ATTEMPT":
      return "Attempted to change a locked answer — rejected";
    case "ANSWER_LOCKED":
      return "Answer locked";
    case "QUESTION_MARKED":
      return "Marked a question for review";
    case "QUESTION_UNMARKED":
      return "Unmarked a question";
    case "COPY":
      return "Copy detected";
    case "PASTE":
      return "Paste detected";
    case "CUT":
      return "Cut detected";
    case "CONNECTION_LOST":
      return "Connection lost";
    case "CONNECTION_RESTORED":
      return "Connection restored";
    case "SESSION_ANOMALY":
      return "Session anomaly detected";
    case "SCREEN_CAPTURE_ATTEMPT":
      return `Screenshot attempt detected (${metadata?.method ?? "unknown method"})`;
    case "TIME_ANOMALY":
      return "Unusually fast completion";
    case "DISQUALIFIED":
      return `Disqualified (${metadata?.reason ?? "rule triggered"})`;
    default:
      return type;
  }
}

export type QuestionHistoryEntry = {
  questionId: string;
  prompt: string;
  order: number;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  timeSpentSec: number;
  markedForReview: boolean;
  isLocked: boolean;
  lockViolations: number;
  changeHistory: { selectedOptionIds: string[]; textAnswer: string | null; at: string }[];
};

/** PHASE 4/16/18 — per-question history + timing for one attempt. */
export async function getQuestionHistory(attemptId: string): Promise<QuestionHistoryEntry[]> {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { selectedQuestionIds: true },
  });
  if (!attempt) return [];

  const answers = await db.questionAnswer.findMany({
    where: { attemptId },
    include: { question: { select: { prompt: true } } },
  });
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));

  return attempt.selectedQuestionIds.map((questionId, order) => {
    const a = byQuestion.get(questionId);
    return {
      questionId,
      prompt: a?.question.prompt ?? "(question unavailable)",
      order,
      firstOpenedAt: a?.firstOpenedAt ?? null,
      lastOpenedAt: a?.lastOpenedAt ?? null,
      timeSpentSec: a?.timeSpentSec ?? 0,
      markedForReview: a?.markedForReview ?? false,
      isLocked: a?.isLocked ?? false,
      lockViolations: a?.lockViolations ?? 0,
      changeHistory: Array.isArray(a?.changeHistory) ? (a!.changeHistory as any[]) : [],
    };
  });
}

export type IntegritySummary = {
  riskLevel: string;
  riskLabel: string;
  riskReasons: string[];
  tabSwitchCount: number;
  fullscreenExitCount: number;
  copyPasteCount: number;
  screenshotAttemptCount: number;
  sessionAnomalyCount: number;
  lockViolationCount: number;
  timeAnomalyCount: number;
  wasDisqualified: boolean;
};

/** PHASE 16 — the stat block at the top of the investigate-attempt page. */
export async function getAttemptIntegritySummary(attemptId: string): Promise<IntegritySummary | null> {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      riskLevel: true,
      riskReasons: true,
      tabSwitchCount: true,
      fullscreenExitCount: true,
      copyPasteCount: true,
      screenshotAttemptCount: true,
      sessionAnomalyCount: true,
      lockViolationCount: true,
      timeAnomalyCount: true,
      wasDisqualified: true,
    },
  });
  if (!attempt) return null;
  return {
    riskLevel: attempt.riskLevel,
    riskLabel: RISK_LEVEL_LABEL[attempt.riskLevel],
    riskReasons: attempt.riskReasons,
    tabSwitchCount: attempt.tabSwitchCount,
    fullscreenExitCount: attempt.fullscreenExitCount,
    copyPasteCount: attempt.copyPasteCount,
    screenshotAttemptCount: attempt.screenshotAttemptCount,
    sessionAnomalyCount: attempt.sessionAnomalyCount,
    lockViolationCount: attempt.lockViolationCount,
    timeAnomalyCount: attempt.timeAnomalyCount,
    wasDisqualified: attempt.wasDisqualified,
  };
}

export type MonitoringRow = {
  attemptId: string;
  userId: string;
  name: string;
  status: string;
  percentage: number | null;
  riskLevel: string;
  riskLabel: string;
};

/** PHASE 17 — the Exam Monitoring Dashboard's row data, sortable by risk. */
export async function getExamMonitoringRows(assessmentId: string): Promise<MonitoringRow[]> {
  const attempts = await db.assessmentAttempt.findMany({
    where: { assessmentId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { startedAt: "desc" },
  });

  const riskOrder: Record<string, number> = { DISQUALIFIED: 0, HIGH_RISK: 1, REVIEW: 2, NORMAL: 3 };

  return attempts
    .map((a) => ({
      attemptId: a.id,
      userId: a.userId,
      name: `${a.user.firstName} ${a.user.lastName}`,
      status: a.status,
      percentage: a.percentage,
      riskLevel: a.riskLevel,
      riskLabel: RISK_LEVEL_LABEL[a.riskLevel],
    }))
    .sort((x, y) => riskOrder[x.riskLevel]! - riskOrder[y.riskLevel]!);
}

export type CollusionPair = {
  userAName: string;
  userBName: string;
  similarityPct: number;
  sharedWrongAnswers: number;
};

/**
 * PHASE 19 — post-exam anti-collusion analysis. Deliberately just a
 * similarity SIGNAL, never an accusation: compares each pair of GRADED
 * attempts on (a) how often they picked the exact same option for the
 * same question, weighted extra when that shared answer was WRONG
 * (agreeing on a distractor is a much stronger signal than agreeing on
 * the obviously-correct choice). Quadratic in attempt count — fine for
 * a single exam's roster size, not meant for cross-exam analysis.
 *
 * This runs on every load of the live-exams monitoring page, so it
 * guards itself: above COLLUSION_ANALYSIS_MAX_ATTEMPTS graded attempts
 * (40k+ pairwise comparisons), it skips the computation rather than
 * silently adding real latency to that page for a large class —
 * returning `skipped: true` so the caller can say so instead of just
 * quietly showing nothing.
 */
const COLLUSION_ANALYSIS_MAX_ATTEMPTS = 200;

export async function getAntiCollusionAnalysis(
  assessmentId: string
): Promise<{ pairs: CollusionPair[]; skipped: boolean }> {
  const attempts = await db.assessmentAttempt.findMany({
    where: { assessmentId, status: "GRADED" },
    include: {
      user: { select: { firstName: true, lastName: true } },
      answers: { select: { questionId: true, selectedOptionIds: true, isCorrect: true } },
    },
  });
  if (attempts.length < 2) return { pairs: [], skipped: false };
  if (attempts.length > COLLUSION_ANALYSIS_MAX_ATTEMPTS) return { pairs: [], skipped: true };

  const pairs: CollusionPair[] = [];
  for (let i = 0; i < attempts.length; i++) {
    for (let j = i + 1; j < attempts.length; j++) {
      // Safe: i and j are always < attempts.length by the loop bounds above.
      const a = attempts[i]!;
      const b = attempts[j]!;
      const aByQ = new Map(a.answers.map((x) => [x.questionId, x]));
      let compared = 0;
      let matched = 0;
      let sharedWrong = 0;
      for (const bAns of b.answers) {
        const aAns = aByQ.get(bAns.questionId);
        if (!aAns) continue;
        compared++;
        const same =
          JSON.stringify([...aAns.selectedOptionIds].sort()) ===
          JSON.stringify([...bAns.selectedOptionIds].sort());
        if (same && aAns.selectedOptionIds.length > 0) {
          matched++;
          if (aAns.isCorrect === false && bAns.isCorrect === false) sharedWrong++;
        }
      }
      if (compared === 0) continue;
      const similarityPct = Math.round((matched / compared) * 100);
      // Only surface pairs worth a teacher's attention — mirrors PHASE 19's
      // "Similarity 94% — Review recommended" example, not every pair.
      if (similarityPct >= 80 && sharedWrong >= 2) {
        pairs.push({
          userAName: `${a.user.firstName} ${a.user.lastName}`,
          userBName: `${b.user.firstName} ${b.user.lastName}`,
          similarityPct,
          sharedWrongAnswers: sharedWrong,
        });
      }
    }
  }
  return { pairs: pairs.sort((x, y) => y.similarityPct - x.similarityPct), skipped: false };
}
