import type { QuestionType } from "@prisma/client";
import type { GradableQuestion } from "@/lib/grading";

// ---------------------------------------------------------------------
// Pure rules for one exam attempt: when it ends, what the student saw,
// and how its options are ordered. No DB access, so the exam page, the
// server actions and the expiry sweep all agree, and it can be tested.
// ---------------------------------------------------------------------

/** Slack after the deadline for the last autosave / auto-submit to land. */
export const ANSWER_GRACE_SECONDS = 30;

/** A hidden page shorter than this is not counted as leaving the exam. */
export const TAB_SWITCH_MIN_AWAY_SECONDS = 2;

type AttemptClock = { startedAt: Date; extraTimeSeconds: number };
type AssessmentClock = { timeLimitSeconds: number | null; autoSubmitOnExpiry: boolean };

/** When this attempt's time runs out, or null for an untimed exam. */
export function attemptDeadline(attempt: AttemptClock, assessment: AssessmentClock): Date | null {
  if (!assessment.timeLimitSeconds) return null;
  return new Date(
    attempt.startedAt.getTime() + (assessment.timeLimitSeconds + attempt.extraTimeSeconds) * 1000
  );
}

/**
 * Whether the server should stop accepting answers and close the attempt.
 * Exams that don't auto-submit on expiry are deliberately soft-timed and
 * never expire here.
 */
export function isAttemptExpired(
  attempt: AttemptClock,
  assessment: AssessmentClock,
  now: Date = new Date()
): boolean {
  if (!assessment.autoSubmitOnExpiry) return false;
  const deadline = attemptDeadline(attempt, assessment);
  return deadline !== null && now.getTime() > deadline.getTime() + ANSWER_GRACE_SECONDS * 1000;
}

/**
 * Extra seconds that give a finished or running attempt `minutes` more
 * from `now`, on top of whatever extra time it already has.
 */
export function extraTimeForMinutesFromNow(
  attempt: AttemptClock,
  assessment: AssessmentClock,
  minutes: number,
  now: Date = new Date()
): number {
  if (!assessment.timeLimitSeconds) return attempt.extraTimeSeconds;
  const elapsed = Math.ceil((now.getTime() - attempt.startedAt.getTime()) / 1000);
  const needed = elapsed + minutes * 60 - assessment.timeLimitSeconds;
  return Math.max(attempt.extraTimeSeconds, needed, 0);
}

// ---------------------------------------------------------------------
// Question snapshot: the question as it was when the student answered.
// Grading and the result page read this, so editing a question later
// never rewrites a result that already exists.
// ---------------------------------------------------------------------

export type QuestionSnapshot = {
  prompt: string;
  type: QuestionType;
  points: number;
  explanation: string | null;
  numericAnswer: number | null;
  numericTolerance: number | null;
  numericUnit: string | null;
  options: { id: string; label: string; isCorrect: boolean }[];
};

export type SnapshotSource = {
  prompt: string;
  type: QuestionType;
  points: number;
  explanation?: string | null;
  numericAnswer?: number | null;
  numericTolerance?: number | null;
  numericUnit?: string | null;
  options: { id: string; label: string; isCorrect: boolean; order?: number }[];
};

export function buildQuestionSnapshot(question: SnapshotSource): QuestionSnapshot {
  return {
    prompt: question.prompt,
    type: question.type,
    points: question.points,
    explanation: question.explanation ?? null,
    numericAnswer: question.numericAnswer ?? null,
    numericTolerance: question.numericTolerance ?? null,
    numericUnit: question.numericUnit ?? null,
    options: [...question.options]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect })),
  };
}

/**
 * The question to grade and show for one answer: the stored snapshot when
 * there is one, otherwise the question as it is now. Older snapshots only
 * held prompt/type/points/options, so anything they lack comes from `live`.
 */
export function resolveQuestion(snapshot: unknown, live: SnapshotSource | null | undefined): QuestionSnapshot | null {
  const s = snapshot as Partial<QuestionSnapshot> | null | undefined;
  const usable =
    s && typeof s === "object" && typeof s.prompt === "string" && typeof s.type === "string" && Array.isArray(s.options);
  if (!usable) return live ? buildQuestionSnapshot(live) : null;
  const fallback = live ? buildQuestionSnapshot(live) : null;
  return {
    prompt: s.prompt!,
    type: s.type!,
    points: typeof s.points === "number" ? s.points : (fallback?.points ?? 1),
    explanation: s.explanation !== undefined ? s.explanation : (fallback?.explanation ?? null),
    numericAnswer: s.numericAnswer !== undefined ? s.numericAnswer : (fallback?.numericAnswer ?? null),
    numericTolerance: s.numericTolerance !== undefined ? s.numericTolerance : (fallback?.numericTolerance ?? null),
    numericUnit: s.numericUnit !== undefined ? s.numericUnit : (fallback?.numericUnit ?? null),
    options: s.options!.map((o) => ({ id: o.id, label: o.label, isCorrect: Boolean(o.isCorrect) })),
  };
}

export function toGradable(question: QuestionSnapshot): GradableQuestion {
  return {
    type: question.type,
    points: question.points,
    options: question.options,
    numericAnswer: question.numericAnswer,
    numericTolerance: question.numericTolerance,
  };
}

/** Whether the student actually put something in this answer. */
export function hasAnswerContent(
  answer: { selectedOptionIds: string[]; textAnswer: string | null } | null | undefined
): boolean {
  return Boolean(answer && (answer.selectedOptionIds.length > 0 || (answer.textAnswer ?? "").trim().length > 0));
}

// ---------------------------------------------------------------------
// Option order
// ---------------------------------------------------------------------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Shuffles in an order fixed by `seed`, so a refresh shows a student the
 * same option order while two students (different attempts) see different
 * ones. Nothing is stored: the order is recomputed from the attempt id.
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = hashSeed(seed) || 1;
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// ---------------------------------------------------------------------
// When the per-question answers may be shown
// ---------------------------------------------------------------------

/**
 * Whether a student may see the correct answers for an attempt.
 * `showResultsInstantly` off hides them for good. With
 * `revealAnswersAfterClose` on they stay hidden while the exam could still
 * be taken: until a live exam's access window closes, or (for an exam with
 * no closing time) until this student has passed or has no attempts left.
 */
export function canRevealAnswers(input: {
  showResultsInstantly: boolean;
  revealAnswersAfterClose: boolean;
  isLiveExam: boolean;
  accessClosesAt: Date | null;
  attemptsRemaining: number;
  hasPassed: boolean;
  now?: Date;
}): boolean {
  if (!input.showResultsInstantly) return false;
  if (!input.revealAnswersAfterClose) return true;
  if (input.isLiveExam && input.accessClosesAt) {
    return (input.now ?? new Date()).getTime() > input.accessClosesAt.getTime();
  }
  return input.hasPassed || input.attemptsRemaining <= 0;
}
