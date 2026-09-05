import type { QuestionType } from "@prisma/client";

export const AUTO_GRADED_TYPES: QuestionType[] = [
  "MCQ",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_IN_BLANK",
  "NUMERICAL",
];

export function isAutoGradable(type: QuestionType): boolean {
  return AUTO_GRADED_TYPES.includes(type);
}

export type GradableQuestion = {
  type: QuestionType;
  points: number;
  options: { id: string; label: string; isCorrect: boolean }[];
  // NUMERICAL only.
  numericAnswer?: number | null;
  numericTolerance?: number | null;
};

export type SubmittedAnswer = {
  selectedOptionIds: string[];
  textAnswer: string | null;
} | null;

export type GradeResult = {
  isCorrect: boolean;
  pointsAwarded: number;
};

/**
 * Grades a single auto-gradable question against a submitted answer.
 * Only called for MCQ / MULTIPLE_SELECT / TRUE_FALSE / FILL_IN_BLANK /
 * NUMERICAL — ESSAY and SHORT_ANSWER are never auto-graded and are the
 * caller's responsibility to route to manual review instead.
 *
 * NUMERICAL grading is authoritative here — a plain float comparison
 * against Question.numericAnswer ± numericTolerance — never delegated
 * to an AI, even for AI-generated or parameterized numerical questions
 * (see the parameterized-question notes in the schema). An AI can help
 * author the reference answer; it never judges a submission at grading
 * time.
 *
 * Negative marking only applies to a question the student actually
 * attempted — an unanswered question never loses points, only a wrong
 * one does.
 */
export function gradeAutoGradableQuestion(
  question: GradableQuestion,
  answer: SubmittedAnswer,
  negativeMarkingRatio: number
): GradeResult {
  const correctOptionIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);

  let isCorrect: boolean;
  if (question.type === "FILL_IN_BLANK") {
    const acceptable = question.options.map((o) => o.label.trim().toLowerCase());
    const given = (answer?.textAnswer ?? "").trim().toLowerCase();
    isCorrect = given.length > 0 && acceptable.includes(given);
  } else if (question.type === "NUMERICAL") {
    const given = answer?.textAnswer?.trim();
    const givenNum = given ? Number(given) : NaN;
    const target = question.numericAnswer;
    const tolerance = question.numericTolerance ?? 0;
    isCorrect =
      given !== undefined &&
      given !== "" &&
      !Number.isNaN(givenNum) &&
      target != null &&
      Math.abs(givenNum - target) <= tolerance;
  } else {
    const selected = new Set(answer?.selectedOptionIds ?? []);
    isCorrect =
      selected.size === correctOptionIds.length &&
      correctOptionIds.every((id) => selected.has(id));
  }

  if (isCorrect) {
    return { isCorrect: true, pointsAwarded: question.points };
  }

  const hasAnyAnswer = Boolean(
    (answer?.selectedOptionIds && answer.selectedOptionIds.length > 0) ||
      (answer?.textAnswer && answer.textAnswer.trim().length > 0)
  );

  const pointsAwarded =
    hasAnyAnswer && negativeMarkingRatio > 0
      ? -(question.points * negativeMarkingRatio)
      : 0;

  return { isCorrect: false, pointsAwarded };
}

/**
 * Aggregates per-question results into an attempt-level score. Floors
 * the raw score at zero — negative marking can never make an attempt's
 * total go below zero, only reduce how much credit it earns.
 */
export function summarizeAttemptScore(
  results: { pointsAwarded: number; questionPoints: number }[]
) {
  const rawScoreUnfloored = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
  const rawScore = Math.max(0, rawScoreUnfloored);
  const maxScore = results.reduce((sum, r) => sum + r.questionPoints, 0);
  const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
  return { rawScore, maxScore, percentage };
}

export function isPassing(percentage: number, passPercentage: number): boolean {
  return percentage >= passPercentage;
}
