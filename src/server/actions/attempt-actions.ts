"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { Prisma, type ExamIntegrityEventType } from "@prisma/client";
import { awardXp } from "@/lib/gamification/award-xp";
import { awardCoins } from "@/lib/gamification/coins";
import { checkEncounterAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import {
  isAutoGradable,
  gradeAutoGradableQuestion,
  summarizeAttemptScore,
  isPassing,
} from "@/lib/grading";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEncounterAchievementSignals } from "@/server/services/exam-analytics";
import { isWithinStudentAccessWindow } from "@/lib/live-exam";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { computeRisk, buildSessionFingerprint, TAB_SWITCH_DISQUALIFY_THRESHOLD, type RiskInput } from "@/lib/exam-integrity";
import { requireActiveUser } from "./require-user";
import { requireCompletedProfile } from "@/lib/auth/require-auth";
import { AttemptRedirectSignal } from "./attempt-redirect-signal";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// ---------------------------------------------------------------------
// EXAM INTEGRITY & SECURITY — shared helpers
//
// logIntegrityEvent is deliberately fire-and-forget-safe (awaited, but
// never throws into the caller) — a logging failure must never break
// answer-saving or submission. recomputeRisk re-derives riskLevel from
// the attempt's own counters using the single scoring function in
// lib/exam-integrity.ts, so the stored riskLevel never drifts from
// what the investigate page would compute from the same numbers.
// ---------------------------------------------------------------------

async function logIntegrityEvent(
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

/**
 * Recomputes riskLevel/riskReasons. Accepts already-known counters when
 * the caller just incremented one via an update+select in the same
 * round trip (see recordTabSwitch etc. below) — avoiding a second
 * findUnique purely to re-read numbers the caller already has. Either
 * way this issues exactly one update write.
 */
async function recomputeRisk(attemptId: string, knownCounters?: RiskInput) {
  const counters =
    knownCounters ??
    (await db.assessmentAttempt.findUnique({ where: { id: attemptId }, select: RISK_COUNTER_SELECT }));
  if (!counters) return;
  const { level, reasons } = computeRisk(counters);
  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { riskLevel: level, riskReasons: reasons },
  });
  return level;
}

/** Loads an IN_PROGRESS attempt owned by the current user, or throws. */
async function loadOwnedInProgressAttempt(attemptId: string, userId: string) {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.userId !== userId) throw new Error("Attempt not found.");
  return attempt;
}

async function assertAccessToAssessment(assessmentId: string, userId: string) {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      courseId: true,
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
      isLiveExam: true,
      publishedAt: true,
      monitoringStartsAt: true,
      monitoringEndsAt: true,
      accessOpensAt: true,
      accessClosesAt: true,
      archivedAt: true,
    },
  });
  if (!assessment) throw new Error("Encounter not found.");
  const courseId = assessment.courseId ?? assessment.lesson?.group.chapter.module.courseId;
  if (!courseId) throw new Error("Encounter isn't linked to a mission.");

  // Belt-and-suspenders alongside the create/publish-time check in
  // assessment-actions.ts — if a course's exams get disabled AFTER an
  // assessment was published, this stops a student from starting a new
  // attempt on it even though the row itself still exists.
  const course = await db.course.findUnique({ where: { id: courseId }, select: { examsEnabled: true } });
  if (!course?.examsEnabled) throw new Error("Exams aren't available for this mission right now.");

  if (!isWithinStudentAccessWindow(assessment)) {
    throw new Error("This exam isn't open for new attempts right now.");
  }

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) throw new Error("You need to enroll in this mission first.");
  return courseId;
}

// ---------------------------------------------------------------------
// START
// ---------------------------------------------------------------------

export async function startAttempt(assessmentId: string) {
  // PHASE 5.5: the true creation entry point for an exam attempt — the
  // rest of this file's actions (saveAnswer, recordTabSwitch, etc.) all
  // operate on an attempt row that could only exist if this succeeded,
  // and already verify attempt.userId === user.id ownership, so gating
  // here is the meaningful chokepoint rather than repeating the check
  // on every sub-action.
  const user = await requireCompletedProfile();

  if (!(await isFeatureEnabled("exams", { userId: user.id, role: user.role }))) {
    throw new Error("Exams are temporarily paused. Please try again shortly.");
  }

  await assertAccessToAssessment(assessmentId, user.id);

  const rl = await checkRateLimit("strict", user.id);
  if (!rl.success) throw new Error("Too many attempts started recently — please wait a moment.");

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: { questionLinks: { select: { questionId: true } } },
  });
  if (!assessment || !assessment.publishedAt) {
    throw new Error("This encounter isn't available yet.");
  }

  const priorAttempts = await db.assessmentAttempt.count({
    where: { assessmentId, userId: user.id },
  });

  // Checked BEFORE the maxAttempts gate below, deliberately — an
  // in-progress attempt already counts toward priorAttempts, so with
  // the default maxAttempts=1, checking the limit first would lock a
  // student out with "you've used all your attempts" on the very
  // refresh/re-navigation that should just resume their current one.
  const inProgress = await db.assessmentAttempt.findFirst({
    where: { assessmentId, userId: user.id, status: "IN_PROGRESS" },
  });
  if (inProgress) throw new AttemptRedirectSignal(`/encounters/${assessmentId}`);

  if (priorAttempts >= assessment.maxAttempts) {
    throw new Error("You've used all your attempts for this encounter.");
  }

  let questionIds = assessment.questionLinks.map((l) => l.questionId);
  if (assessment.questionBankSize && assessment.questionBankSize < questionIds.length) {
    questionIds = shuffle(questionIds).slice(0, assessment.questionBankSize);
  }
  if (assessment.randomizeQuestions) {
    questionIds = shuffle(questionIds);
  }

  // The count-then-create above is not airtight on its own — two
  // concurrent starts (a double-click, two tabs) can both read the same
  // `priorAttempts` count before either creates a row, and both pass
  // the maxAttempts check, resulting in more attempts than allowed.
  // The real guard is the unique constraint on
  // (assessmentId, userId, attemptNumber): both concurrent calls would
  // compute the same attemptNumber and race to insert it; the loser
  // hits P2002 and is treated as "someone already started this attempt
  // number" rather than silently granting an extra attempt.
  // Coarse fingerprint captured once at start, from the request's own
  // User-Agent header (never client-supplied data) — see PHASE 13 /
  // lib/exam-integrity.ts. Best-effort: headers() can't fail in a
  // server action, but wrap anyway so a missing header never blocks
  // starting the exam.
  const userAgent = headers().get("user-agent") ?? "unknown";
  const sessionFingerprint = buildSessionFingerprint({ userAgent, viewport: "" });

  let createdAttemptId: string;
  try {
    const created = await db.assessmentAttempt.create({
      data: {
        assessmentId,
        userId: user.id,
        attemptNumber: priorAttempts + 1,
        selectedQuestionIds: questionIds,
        sessionFingerprint,
      },
    });
    createdAttemptId = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AttemptRedirectSignal(`/encounters/${assessmentId}`);
    }
    throw err;
  }

  await logIntegrityEvent(createdAttemptId, "EXAM_STARTED", { userAgent });

  revalidatePath(`/encounters/${assessmentId}`);
  throw new AttemptRedirectSignal(`/encounters/${assessmentId}`);
}

// ---------------------------------------------------------------------
// AUTOSAVE ANSWER
// ---------------------------------------------------------------------

export async function saveAnswer(input: {
  attemptId: string;
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}) {
  const user = await requireActiveUser();

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: input.attemptId },
    include: { assessment: { select: { lockAnswersAfterSelection: true } } },
  });
  if (!attempt || attempt.userId !== user.id) throw new Error("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") throw new Error("This attempt is already submitted.");

  // Never trust questionId directly — it must be one of the exact
  // questions actually selected for THIS attempt (selectedQuestionIds
  // was computed and locked at start time). Without this check a
  // student could save an "answer" against a question from a different
  // assessment/course entirely. Grading itself only reads answers
  // matched against selectedQuestionIds, so this couldn't have skewed a
  // score — but it's still foreign, untrusted data with no business
  // being written, and this closes it off at the source.
  if (!attempt.selectedQuestionIds.includes(input.questionId)) {
    throw new Error("That question isn't part of this attempt.");
  }

  const existing = await db.questionAnswer.findUnique({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
  });

  // PHASE 2 — LOCKED ANSWERS. UI-side disabling is not enough on its
  // own (see exam-runner.tsx), so this is the actual enforcement
  // point: once an answer under a lockAnswersAfterSelection exam has
  // been selected once, no further selection change is accepted, full
  // stop, regardless of what the client sends. Mark-for-review is a
  // separate action (toggleMarkForReview) and is never blocked here.
  const hasExistingSelection =
    (existing?.selectedOptionIds.length ?? 0) > 0 || Boolean(existing?.textAnswer);
  if (attempt.assessment.lockAnswersAfterSelection && existing?.isLocked && hasExistingSelection) {
    const attemptedChange =
      JSON.stringify(input.selectedOptionIds ?? []) !== JSON.stringify(existing.selectedOptionIds) ||
      (input.textAnswer ?? "") !== (existing.textAnswer ?? "");
    if (attemptedChange) {
      await logIntegrityEvent(input.attemptId, "ANSWER_CHANGE_ATTEMPT", {
        questionId: input.questionId,
        attempted: { selectedOptionIds: input.selectedOptionIds, textAnswer: input.textAnswer },
      });
      await db.$transaction([
        db.questionAnswer.update({
          where: { id: existing.id },
          data: { lockViolations: { increment: 1 } },
        }),
        db.assessmentAttempt.update({
          where: { id: input.attemptId },
          data: { lockViolationCount: { increment: 1 } },
        }),
      ]);
      await recomputeRisk(input.attemptId);
      throw new Error("This answer is locked and can't be changed.");
    }
    // Identical resubmission of an already-locked answer (e.g. a
    // debounced autosave firing again) — a harmless no-op, not a
    // violation.
    return;
  }

  // The question row is only ever needed to build questionSnapshot,
  // and that snapshot must be captured ONCE — at the moment an answer
  // first exists — and never touched again. Two reasons:
  //  1. Correctness: if a teacher edits the question's wording/options
  //     while this exam is live, re-fetching and overwriting the
  //     snapshot on every later save would silently replace the
  //     original question the student actually saw with the edited
  //     one — exactly what "question snapshots survive a later edit"
  //     is supposed to prevent.
  //  2. Cost: this was previously an extra query + a full options join
  //     on every single keystroke-triggered save, for a value that
  //     never changes after the first write.
  // So: fetch (and set) it only on create; every update reuses
  // whatever snapshot is already stored.
  let questionSnapshot: Prisma.InputJsonValue | undefined = existing?.questionSnapshot as
    | Prisma.InputJsonValue
    | undefined;
  if (!existing) {
    const question = await db.question.findUnique({
      where: { id: input.questionId },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!question) throw new Error("Question not found.");
    questionSnapshot = {
      prompt: question.prompt,
      type: question.type,
      points: question.points,
      options: question.options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect })),
    };
  }

  const willBeAnswered = (input.selectedOptionIds?.length ?? 0) > 0 || Boolean(input.textAnswer);
  const wasAlreadyAnswered = hasExistingSelection;
  const shouldLockNow = attempt.assessment.lockAnswersAfterSelection && willBeAnswered;

  // History is meant for PHASE 18's discrete "A → C → B" answer trail,
  // not a keystroke-by-keystroke transcript of a typed answer — the
  // latter is both unreadable on the investigate page and, without a
  // cap, an unbounded JSON column (a long essay edited over 20 minutes
  // could otherwise add hundreds of near-identical entries). So: every
  // save updates the current value, but a new history ENTRY is only
  // appended when the visible selection actually changed since the
  // last entry, and the array is capped to the most recent 20 entries
  // regardless (oldest dropped first) as a hard ceiling independent of
  // that de-duplication.
  const priorHistory = Array.isArray(existing?.changeHistory) ? (existing!.changeHistory as any[]) : [];
  const lastEntry = priorHistory[priorHistory.length - 1];
  const nextSelection = input.selectedOptionIds ?? [];
  const nextText = input.textAnswer ?? null;
  const changedSinceLastEntry =
    !lastEntry ||
    JSON.stringify(lastEntry.selectedOptionIds ?? []) !== JSON.stringify(nextSelection) ||
    (lastEntry.textAnswer ?? null) !== nextText;
  const nextHistory =
    willBeAnswered && changedSinceLastEntry
      ? [...priorHistory, { selectedOptionIds: nextSelection, textAnswer: nextText, at: new Date().toISOString() }].slice(-20)
      : priorHistory;

  await db.questionAnswer.upsert({
    where: {
      attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId },
    },
    create: {
      attemptId: input.attemptId,
      questionId: input.questionId,
      userId: user.id,
      selectedOptionIds: input.selectedOptionIds ?? [],
      textAnswer: input.textAnswer ?? null,
      questionSnapshot,
      isLocked: shouldLockNow,
      changeHistory: nextHistory.length > 0 ? nextHistory : Prisma.JsonNull,
    },
    update: {
      selectedOptionIds: input.selectedOptionIds ?? [],
      textAnswer: input.textAnswer ?? null,
      isLocked: shouldLockNow || existing?.isLocked || false,
      changeHistory: nextHistory.length > 0 ? nextHistory : existing?.changeHistory ?? Prisma.JsonNull,
    },
  });

  // Only logged on the FIRST transition into "answered," not on every
  // subsequent edit — otherwise an essay question edited over several
  // minutes (even debounced) would spam the integrity timeline with a
  // few hundred near-identical ANSWER_SELECTED rows for one question.
  if (willBeAnswered && !wasAlreadyAnswered) {
    await logIntegrityEvent(
      input.attemptId,
      shouldLockNow ? "ANSWER_LOCKED" : "ANSWER_SELECTED",
      { questionId: input.questionId }
    );
  }
}

// ---------------------------------------------------------------------
// MARK FOR REVIEW (persisted — PHASE 4/16 need this in teacher-facing
// history; still carries no grading meaning, and works independently
// of locking per PHASE 2's "a locked answer may still be marked").
// ---------------------------------------------------------------------

export async function toggleMarkForReview(attemptId: string, questionId: string) {
  const user = await requireActiveUser();
  const attempt = await db.assessmentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== user.id) throw new Error("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") throw new Error("This attempt is already submitted.");
  if (!attempt.selectedQuestionIds.includes(questionId)) {
    throw new Error("That question isn't part of this attempt.");
  }

  const existing = await db.questionAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
  });
  const nextMarked = !existing?.markedForReview;

  await db.questionAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: {
      attemptId,
      questionId,
      userId: user.id,
      selectedOptionIds: [],
      markedForReview: nextMarked,
    },
    update: { markedForReview: nextMarked },
  });

  await logIntegrityEvent(attemptId, nextMarked ? "QUESTION_MARKED" : "QUESTION_UNMARKED", { questionId });
  return { marked: nextMarked };
}

// ---------------------------------------------------------------------
// PER-QUESTION TIME TRACKING (PHASE 5) — client accumulates locally
// and flushes on question-change / periodic interval, never per
// keystroke, to keep DB writes proportional to questions visited, not
// to time elapsed. First/last-open timestamps piggyback on the same
// call to avoid a second round trip.
// ---------------------------------------------------------------------

export async function recordQuestionTime(input: {
  attemptId: string;
  questionId: string;
  deltaSeconds: number;
}) {
  const user = await requireActiveUser();
  if (input.deltaSeconds <= 0) return;
  const attempt = await db.assessmentAttempt.findUnique({ where: { id: input.attemptId } });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS") return;
  if (!attempt.selectedQuestionIds.includes(input.questionId)) return;

  const now = new Date();
  const existing = await db.questionAnswer.findUnique({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
  });

  await db.questionAnswer.upsert({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
    create: {
      attemptId: input.attemptId,
      questionId: input.questionId,
      userId: user.id,
      selectedOptionIds: [],
      firstOpenedAt: now,
      lastOpenedAt: now,
      timeSpentSec: Math.round(input.deltaSeconds),
    },
    update: {
      firstOpenedAt: existing?.firstOpenedAt ?? now,
      lastOpenedAt: now,
      timeSpentSec: { increment: Math.round(input.deltaSeconds) },
    },
  });

  if (!existing?.firstOpenedAt) {
    await logIntegrityEvent(input.attemptId, "QUESTION_OPENED", { questionId: input.questionId });
  }
}

// ---------------------------------------------------------------------
// TAB-SWITCH TRACKING (PHASE 6 — reuses this existing counter/threshold;
// now also logs a timestamped event for the attempt timeline instead of
// only bumping a counter).
// ---------------------------------------------------------------------

export async function recordTabSwitch(attemptId: string) {
  const user = await requireActiveUser();

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { tabSwitchDetection: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.tabSwitchDetection) return;

  const tabSwitchCount = attempt.tabSwitchCount + 1;
  const shouldDisqualify = tabSwitchCount >= TAB_SWITCH_DISQUALIFY_THRESHOLD;
  const wasDisqualified = shouldDisqualify || attempt.wasDisqualified;
  // attempt was fetched with no `select`, so every other risk counter
  // is already sitting on this object — computing risk from it and
  // writing both the counter and riskLevel/riskReasons in ONE update
  // means this whole function costs 2 queries (fetch + update) instead
  // of 4 (fetch, update, then recomputeRisk's own fetch + update).
  const { level, reasons } = computeRisk({ ...attempt, tabSwitchCount, wasDisqualified });

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { tabSwitchCount, wasDisqualified, riskLevel: level, riskReasons: reasons },
  });
  await logIntegrityEvent(attemptId, "TAB_SWITCH", { tabSwitchCount });

  if (shouldDisqualify) {
    await logIntegrityEvent(attemptId, "DISQUALIFIED", { reason: "tab_switch_threshold" });
    await submitAttempt(attemptId, { disqualified: true });
  }

  return { tabSwitchCount, disqualified: shouldDisqualify };
}

// ---------------------------------------------------------------------
// WINDOW FOCUS / BLUR (finer-grained than the tab-switch counter above
// — purely informational for the timeline, never disqualifying).
// ---------------------------------------------------------------------

export async function recordWindowFocusChange(attemptId: string, focused: boolean) {
  const user = await requireActiveUser();
  const attempt = await loadOwnedInProgressAttempt(attemptId, user.id).catch(() => null);
  if (!attempt || attempt.status !== "IN_PROGRESS") return;
  await logIntegrityEvent(attemptId, focused ? "WINDOW_FOCUS" : "WINDOW_BLUR");
}

// ---------------------------------------------------------------------
// FULLSCREEN (PHASE 7 — reuses the existing fullscreenRequired flag;
// fullscreenExitAction decides what happens beyond logging).
// ---------------------------------------------------------------------

export async function recordFullscreenChange(attemptId: string, entered: boolean) {
  const user = await requireActiveUser();
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { fullscreenRequired: true, fullscreenExitAction: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.fullscreenRequired) return;

  await logIntegrityEvent(attemptId, entered ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
  if (entered) return { action: "none" as const };

  const action = attempt.assessment.fullscreenExitAction;
  const fullscreenExitCount = attempt.fullscreenExitCount + 1;
  const { level, reasons } = computeRisk({ ...attempt, fullscreenExitCount });
  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { fullscreenExitCount, riskLevel: level, riskReasons: reasons },
  });

  if (action === "AUTO_DISQUALIFY") {
    await db.assessmentAttempt.update({ where: { id: attemptId }, data: { wasDisqualified: true } });
    await logIntegrityEvent(attemptId, "DISQUALIFIED", { reason: "fullscreen_exit" });
    await submitAttempt(attemptId, { disqualified: true });
    return { action: "disqualified" as const };
  }
  return { action: action === "FLAG" ? "flagged" as const : "warning" as const, riskLevel: level };
}

// ---------------------------------------------------------------------
// COPY / PASTE / CUT (PHASE 8) — logged as signals, never treated as
// proof of cheating on their own.
// ---------------------------------------------------------------------

export async function recordClipboardEvent(
  attemptId: string,
  kind: "COPY" | "PASTE" | "CUT",
  questionId?: string
) {
  const user = await requireActiveUser();
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { detectCopyPaste: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.detectCopyPaste) return;

  const copyPasteCount = attempt.copyPasteCount + 1;
  const { level, reasons } = computeRisk({ ...attempt, copyPasteCount });
  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { copyPasteCount, riskLevel: level, riskReasons: reasons },
  });
  await logIntegrityEvent(attemptId, kind, questionId ? { questionId } : undefined);
}

// ---------------------------------------------------------------------
// SCREENSHOT DETERRENCE (PHASE 9) — client-detectable signals only
// (e.g. PrintScreen keydown, devtools-adjacent shortcuts). A website
// cannot actually prevent screenshots; this never claims otherwise.
// ---------------------------------------------------------------------

export async function recordScreenshotAttempt(attemptId: string, method: string) {
  const user = await requireActiveUser();
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { detectScreenshotAttempts: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.detectScreenshotAttempts) return;

  const screenshotAttemptCount = attempt.screenshotAttemptCount + 1;
  const { level, reasons } = computeRisk({ ...attempt, screenshotAttemptCount });
  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { screenshotAttemptCount, riskLevel: level, riskReasons: reasons },
  });
  await logIntegrityEvent(attemptId, "SCREEN_CAPTURE_ATTEMPT", { method });
}

// ---------------------------------------------------------------------
// CONNECTION TRACKING (PHASE 12) — timeline-only, never auto-punished.
// ---------------------------------------------------------------------

export async function recordConnectionEvent(attemptId: string, restored: boolean) {
  const user = await requireActiveUser();
  const attempt = await loadOwnedInProgressAttempt(attemptId, user.id).catch(() => null);
  if (!attempt || attempt.status !== "IN_PROGRESS") return;
  await logIntegrityEvent(attemptId, restored ? "CONNECTION_RESTORED" : "CONNECTION_LOST");
}

// ---------------------------------------------------------------------
// SESSION ANOMALY DETECTION (PHASE 13) — compares the current
// request's User-Agent against the fingerprint captured at
// EXAM_STARTED. Deliberately does not look at IP address at all (a
// student switching from wifi to mobile data is not an anomaly), and
// never auto-disqualifies by itself.
// ---------------------------------------------------------------------

export async function checkSessionFingerprint(attemptId: string) {
  const user = await requireActiveUser();
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { detectSessionAnomalies: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return { anomaly: false };
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.detectSessionAnomalies) {
    return { anomaly: false };
  }

  const userAgent = headers().get("user-agent") ?? "unknown";
  const currentFingerprint = buildSessionFingerprint({ userAgent, viewport: "" });
  if (!attempt.sessionFingerprint || currentFingerprint === attempt.sessionFingerprint) {
    return { anomaly: false };
  }

  const sessionAnomalyCount = attempt.sessionAnomalyCount + 1;
  const { level, reasons } = computeRisk({ ...attempt, sessionAnomalyCount });
  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { sessionAnomalyCount, riskLevel: level, riskReasons: reasons },
  });
  await logIntegrityEvent(attemptId, "SESSION_ANOMALY", { previous: attempt.sessionFingerprint, current: currentFingerprint });
  return { anomaly: true };
}

// ---------------------------------------------------------------------
// SUBMIT + AUTO-GRADE
// ---------------------------------------------------------------------

export async function submitAttempt(
  attemptId: string,
  opts?: { disqualified?: boolean }
) {
  const user = await requireActiveUser();

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: true,
      answers: true,
    },
  });
  if (!attempt || attempt.userId !== user.id) throw new Error("Attempt not found.");
  if (attempt.status !== "IN_PROGRESS") return; // already submitted, no-op

  // Atomically claim this attempt before doing any grading work. The
  // read above is not enough on its own — two concurrent submits (a
  // double-click, a retried request, a replayed call) can both observe
  // IN_PROGRESS before either has written anything, both proceed to
  // grade, and both award XP. This conditional update is the actual
  // race-safe gate: only the request that flips IN_PROGRESS -> GRADED
  // first gets `count === 1` and continues; every other concurrent
  // caller gets 0 and returns immediately, before any grading or XP.
  // The status/scores set here are placeholders, corrected by the
  // unconditional update further down once this request has sole
  // ownership of the attempt.
  const claim = await db.assessmentAttempt.updateMany({
    where: { id: attemptId, userId: user.id, status: "IN_PROGRESS" },
    data: { status: "GRADED" },
  });
  if (claim.count !== 1) return; // lost the race to another concurrent submit

  const questionIds = attempt.selectedQuestionIds;
  const questions = await db.question.findMany({
    where: { id: { in: questionIds } },
    include: { options: true },
  });
  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const perQuestionResults: { pointsAwarded: number; questionPoints: number }[] = [];
  let hasPendingManualReview = false;

  // Grading itself (isAutoGradable check, gradeAutoGradableQuestion) is
  // pure computation — only the writes touch the DB. Collect those into
  // one array and send them as a single transaction instead of awaiting
  // each update/create in sequence, so a 50-question exam does one round
  // trip instead of 50 before the student sees their score. The per-
  // question logic and the exact data written for each answer are
  // unchanged from before — only *how many round trips* it takes changed.
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const question of questions) {
    const answer = answersByQuestion.get(question.id) ?? null;

    if (!isAutoGradable(question.type)) {
      // ESSAY / SHORT_ANSWER — flagged for the mentor grading queue.
      hasPendingManualReview = true;
      perQuestionResults.push({ pointsAwarded: 0, questionPoints: question.points });
      if (answer) {
        writes.push(
          db.questionAnswer.update({
            where: { id: answer.id },
            data: { isAutoGraded: false },
          })
        );
      }
      continue;
    }

    const { isCorrect, pointsAwarded } = gradeAutoGradableQuestion(
      question,
      answer,
      attempt.assessment.negativeMarkingRatio
    );
    perQuestionResults.push({ pointsAwarded, questionPoints: question.points });

    if (answer) {
      writes.push(
        db.questionAnswer.update({
          where: { id: answer.id },
          data: { isCorrect, pointsAwarded, gradedAt: new Date(), isAutoGraded: true },
        })
      );
    } else {
      writes.push(
        db.questionAnswer.create({
          data: {
            attemptId,
            questionId: question.id,
            userId: user.id,
            selectedOptionIds: [],
            isCorrect: false,
            pointsAwarded: 0,
            isAutoGraded: true,
            gradedAt: new Date(),
          },
        })
      );
    }
  }

  if (writes.length > 0) {
    await db.$transaction(writes);
  }

  const { rawScore, maxScore, percentage } = summarizeAttemptScore(perQuestionResults);
  const timeSpentSec = Math.round((Date.now() - attempt.startedAt.getTime()) / 1000);
  const isPassed = hasPendingManualReview
    ? null
    : isPassing(percentage, attempt.assessment.passPercentage);

  // PHASE 14 time-anomaly signal — a coarse "answered everything
  // implausibly fast" check, not a claim of cheating on its own
  // (per PHASE 5, fast answers are a signal, never proof). Only
  // evaluated for exams with enough questions that an average matters.
  const answeredQuestionCount = attempt.answers.filter(
    (a) => a.selectedOptionIds.length > 0 || a.textAnswer
  ).length;
  const timeAnomalyDetected =
    questionIds.length >= 5 && answeredQuestionCount > 0 && timeSpentSec / questionIds.length < 3;
  if (timeAnomalyDetected) {
    await logIntegrityEvent(attemptId, "TIME_ANOMALY", {
      timeSpentSec,
      questionCount: questionIds.length,
    });
  }

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      status: hasPendingManualReview ? "SUBMITTED" : "GRADED",
      submittedAt: new Date(),
      timeSpentSec,
      rawScore,
      maxScore,
      percentage: hasPendingManualReview ? null : percentage,
      isPassed,
      wasDisqualified: opts?.disqualified || attempt.wasDisqualified,
      timeAnomalyCount: timeAnomalyDetected ? { increment: 1 } : undefined,
    },
  });

  await logIntegrityEvent(attemptId, "EXAM_SUBMITTED", { disqualified: opts?.disqualified ?? false });
  await recomputeRisk(attemptId);

  if (!hasPendingManualReview) {
    if (isPassed) {
      await awardXp(
        user.id,
        attempt.assessment.kind === "EXAM" ? XP_REWARDS.EXAM_PASSED : XP_REWARDS.QUIZ_PASSED,
        { type: "ASSESSMENT_ATTEMPT", id: attemptId, rewardType: attempt.assessment.kind === "EXAM" ? "EXAM_PASSED" : "QUIZ_PASSED" }
      );

      const { coinReward, minimumScoreForCoinReward } = attempt.assessment;
      const coinThreshold = minimumScoreForCoinReward ?? attempt.assessment.passPercentage;
      if (coinReward > 0 && percentage !== null && percentage >= coinThreshold) {
        await awardCoins(user.id, coinReward, {
          type: "EXAM_REWARD",
          // Keyed by assessmentId, not attemptId — a student allowed
          // multiple attempts who passes more than one must still only
          // be awarded once total, not once per qualifying attempt.
          id: attempt.assessmentId,
          reason: attempt.assessment.title,
        });
      }
    }

    // Personal-best / top-decile achievements only mean anything once we
    // have a real percentage to compare — skip for null (shouldn't happen
    // here since hasPendingManualReview is false, but keeps this honest).
    let achievementSignals: { isNewPersonalBest: boolean; percentileRank: number | null } = {
      isNewPersonalBest: false,
      percentileRank: null,
    };
    if (percentage !== null) {
      achievementSignals = await getEncounterAchievementSignals(
        attempt.assessmentId,
        user.id,
        attemptId,
        percentage
      );
    }

    await checkEncounterAchievements(user.id, {
      isPassed,
      percentage,
      isNewPersonalBest: achievementSignals.isNewPersonalBest,
      percentileRank: achievementSignals.percentileRank,
    });
  }

  revalidatePath(`/encounters/${attempt.assessmentId}`);
}
