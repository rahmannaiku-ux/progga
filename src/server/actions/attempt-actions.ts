"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { isWithinStudentAccessWindow } from "@/lib/live-exam";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { computeRisk, buildSessionFingerprint } from "@/lib/exam-integrity";
import {
  TAB_SWITCH_MIN_AWAY_SECONDS,
  attemptDeadline,
  buildQuestionSnapshot,
  hasAnswerContent,
  isAttemptExpired,
} from "@/lib/exam-attempt";
import { closeAttempt, logIntegrityEvent, recomputeRisk } from "@/server/services/attempt-grading";
import { requireActiveUser } from "./require-user";
import { requireCompletedProfile } from "@/lib/auth/require-auth";

// Actions here RETURN their failures ({ ok: false, error }) instead of
// throwing: production replaces a thrown message with a generic one, and
// a student mid-exam needs to be told what actually happened.

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Loads an attempt owned by the current user, or null. */
async function loadOwnedAttempt(attemptId: string, userId: string) {
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.userId !== userId) return null;
  return attempt;
}

const MAX_TEXT_ANSWER_LENGTH = 20_000;
const MAX_SELECTED_OPTIONS = 50;

/** Why this student can't start the exam right now, or null if they can. */
async function accessProblem(assessmentId: string, userId: string): Promise<string | null> {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      courseId: true,
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
      chapter: { select: { module: { select: { courseId: true } } } },
      isLiveExam: true,
      publishedAt: true,
      monitoringStartsAt: true,
      monitoringEndsAt: true,
      accessOpensAt: true,
      accessClosesAt: true,
      archivedAt: true,
    },
  });
  if (!assessment) return "Encounter not found.";
  const courseId =
    assessment.courseId ?? assessment.chapter?.module.courseId ?? assessment.lesson?.group.chapter.module.courseId;
  if (!courseId) return "Encounter isn't linked to a mission.";

  // Belt-and-suspenders alongside the create/publish-time check in
  // assessment-actions.ts — if a course's exams get disabled AFTER an
  // assessment was published, this stops a student from starting a new
  // attempt on it even though the row itself still exists.
  const course = await db.course.findUnique({ where: { id: courseId }, select: { examsEnabled: true } });
  if (!course?.examsEnabled) return "Exams aren't available for this mission right now.";

  if (!isWithinStudentAccessWindow(assessment)) return "This exam isn't open for new attempts right now.";

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) return "You need to enroll in this mission first.";
  return null;
}

// ---------------------------------------------------------------------
// START
// ---------------------------------------------------------------------

export type StartAttemptResult = { ok: true; path: string } | { ok: false; error: string };

export async function startAttempt(assessmentId: string): Promise<StartAttemptResult> {
  // PHASE 5.5: the true creation entry point for an exam attempt — the
  // rest of this file's actions (saveAnswer, recordTabSwitch, etc.) all
  // operate on an attempt row that could only exist if this succeeded,
  // and already verify attempt.userId === user.id ownership, so gating
  // here is the meaningful chokepoint rather than repeating the check
  // on every sub-action.
  const user = await requireCompletedProfile();
  const path = `/exams/${assessmentId}`;

  if (!(await isFeatureEnabled("exams", { userId: user.id, role: user.role }))) {
    return { ok: false, error: "Exams are temporarily paused. Please try again shortly." };
  }

  // Checked first, before the access window and the attempt limit: an
  // attempt already under way is resumed, never refused. It counts
  // towards the limit, so with the default of one attempt the limit
  // check would otherwise lock a student out on a simple page refresh.
  const inProgress = await db.assessmentAttempt.findFirst({
    where: { assessmentId, userId: user.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (inProgress) return { ok: true, path };

  const problem = await accessProblem(assessmentId, user.id);
  if (problem) return { ok: false, error: problem };

  const rl = await checkRateLimit("strict", user.id);
  if (!rl.success) return { ok: false, error: "Too many attempts started recently. Please wait a moment." };

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: { questionLinks: { orderBy: { order: "asc" }, select: { questionId: true } } },
  });
  if (!assessment || !assessment.publishedAt) {
    return { ok: false, error: "This encounter isn't available yet." };
  }

  const priorAttempts = await db.assessmentAttempt.count({
    where: { assessmentId, userId: user.id },
  });
  if (priorAttempts >= assessment.maxAttempts) {
    return { ok: false, error: "You've used all your attempts for this encounter." };
  }

  let questionIds = assessment.questionLinks.map((l) => l.questionId);
  if (assessment.questionBankSize && assessment.questionBankSize < questionIds.length) {
    questionIds = shuffle(questionIds).slice(0, assessment.questionBankSize);
  }
  if (assessment.randomizeQuestions) {
    questionIds = shuffle(questionIds);
  }

  // Coarse fingerprint captured once at start, from the request's own
  // User-Agent header (never client-supplied data) — see
  // lib/exam-integrity.ts.
  const userAgent = (await headers()).get("user-agent") ?? "unknown";
  const sessionFingerprint = buildSessionFingerprint({ userAgent, viewport: "" });

  // The count-then-create above is not airtight on its own: two
  // concurrent starts (a double-click, two tabs) can both read the same
  // count. The real guard is the unique constraint on
  // (assessmentId, userId, attemptNumber): the loser hits P2002 and is
  // sent to the attempt the winner created.
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
    await logIntegrityEvent(created.id, "EXAM_STARTED", { userAgent });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: true, path };
    }
    throw err;
  }

  revalidatePath(path);
  return { ok: true, path };
}

// ---------------------------------------------------------------------
// AUTOSAVE ANSWER
// ---------------------------------------------------------------------

export type SaveAnswerResult =
  | { ok: true }
  // "locked": the answer can't change. "time_up" / "closed": the attempt
  // is over. Anything else the browser may simply retry.
  | { ok: false; code: "locked" | "time_up" | "closed" | "invalid"; error: string };

export async function saveAnswer(input: {
  attemptId: string;
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}): Promise<SaveAnswerResult> {
  const user = await requireActiveUser();

  const selectedOptionIds = Array.isArray(input.selectedOptionIds)
    ? [...new Set(input.selectedOptionIds.filter((id) => typeof id === "string"))]
    : [];
  const textAnswer = typeof input.textAnswer === "string" ? input.textAnswer : "";
  if (selectedOptionIds.length > MAX_SELECTED_OPTIONS || textAnswer.length > MAX_TEXT_ANSWER_LENGTH) {
    return { ok: false, code: "invalid", error: "That answer is too long to save." };
  }

  const attempt = await loadOwnedAttempt(input.attemptId, user.id);
  if (!attempt) return { ok: false, code: "closed", error: "Attempt not found." };
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: false, code: "closed", error: "This attempt is already submitted." };
  }

  // The countdown runs in the browser, so the server is what actually
  // closes a timed exam: an answer arriving after the deadline (plus a
  // short grace for the final autosave) is refused and the attempt is
  // closed. Exams that don't auto-submit on expiry are soft-timed.
  if (isAttemptExpired(attempt, attempt.assessment)) {
    await closeAttempt(attempt.id, { expired: true });
    revalidatePath(`/exams/${attempt.assessmentId}`);
    return { ok: false, code: "time_up", error: "Time is up for this exam." };
  }

  // Never trust questionId directly — it must be one of the exact
  // questions selected for THIS attempt (locked in at start).
  if (!attempt.selectedQuestionIds.includes(input.questionId)) {
    return { ok: false, code: "invalid", error: "That question isn't part of this attempt." };
  }

  const existing = await db.questionAnswer.findUnique({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
  });

  // LOCKED ANSWERS. UI-side disabling is not enough on its own, so this
  // is the actual enforcement point: once an answer under a
  // lockAnswersAfterSelection exam has been selected, no further change
  // is accepted regardless of what the client sends. Mark-for-review is
  // a separate action and is never blocked here.
  const hasExistingSelection = hasAnswerContent(existing);
  if (attempt.assessment.lockAnswersAfterSelection && existing?.isLocked && hasExistingSelection) {
    const attemptedChange =
      JSON.stringify(selectedOptionIds) !== JSON.stringify(existing.selectedOptionIds) ||
      textAnswer !== (existing.textAnswer ?? "");
    if (attemptedChange) {
      await logIntegrityEvent(input.attemptId, "ANSWER_CHANGE_ATTEMPT", {
        questionId: input.questionId,
        attempted: { selectedOptionIds, textAnswer },
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
      return { ok: false, code: "locked", error: "This answer is locked and can't be changed." };
    }
    // Identical resubmission of an already-locked answer (a retried
    // autosave) — a harmless no-op, not a violation.
    return { ok: true };
  }

  // The snapshot is captured ONCE, the first time this answer row gets
  // one, and never touched by later saves: if a mentor edits the
  // question while the exam is live, the student is still graded on the
  // question they saw. (A row can exist without one: mark-for-review
  // and time tracking create rows before any answer is given.)
  let questionSnapshot = existing?.questionSnapshot as Prisma.InputJsonValue | null | undefined;
  if (!questionSnapshot) {
    const question = await db.question.findUnique({
      where: { id: input.questionId },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!question) return { ok: false, code: "invalid", error: "Question not found." };
    questionSnapshot = buildQuestionSnapshot(question) as unknown as Prisma.InputJsonValue;
  }

  const willBeAnswered = selectedOptionIds.length > 0 || textAnswer.length > 0;
  const shouldLockNow = attempt.assessment.lockAnswersAfterSelection && willBeAnswered;

  // changeHistory is the discrete "A → C → B" answer trail, not a
  // keystroke transcript: an entry is appended only when the visible
  // answer changed since the last entry, capped at the latest 20.
  const priorHistory = Array.isArray(existing?.changeHistory) ? (existing!.changeHistory as any[]) : [];
  const lastEntry = priorHistory[priorHistory.length - 1];
  const nextText = textAnswer || null;
  const changedSinceLastEntry =
    !lastEntry ||
    JSON.stringify(lastEntry.selectedOptionIds ?? []) !== JSON.stringify(selectedOptionIds) ||
    (lastEntry.textAnswer ?? null) !== nextText;
  const nextHistory =
    willBeAnswered && changedSinceLastEntry
      ? [...priorHistory, { selectedOptionIds, textAnswer: nextText, at: new Date().toISOString() }].slice(-20)
      : priorHistory;

  await db.questionAnswer.upsert({
    where: {
      attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId },
    },
    create: {
      attemptId: input.attemptId,
      questionId: input.questionId,
      userId: user.id,
      selectedOptionIds,
      textAnswer: nextText,
      questionSnapshot,
      isLocked: shouldLockNow,
      changeHistory: nextHistory.length > 0 ? nextHistory : Prisma.JsonNull,
    },
    update: {
      selectedOptionIds,
      textAnswer: nextText,
      questionSnapshot,
      isLocked: shouldLockNow || existing?.isLocked || false,
      changeHistory: nextHistory.length > 0 ? nextHistory : (existing?.changeHistory ?? Prisma.JsonNull),
    },
  });

  // Logged only on the FIRST transition into "answered", not on every
  // edit — otherwise one essay would fill the integrity timeline.
  if (willBeAnswered && !hasExistingSelection) {
    await logIntegrityEvent(
      input.attemptId,
      shouldLockNow ? "ANSWER_LOCKED" : "ANSWER_SELECTED",
      { questionId: input.questionId }
    );
  }
  return { ok: true };
}

/**
 * The server's view of the attempt's clock. The exam page polls this so
 * the countdown follows the server (a phone's clock can be wrong), picks
 * up extra time a mentor added, and notices when the attempt was closed
 * elsewhere.
 */
export async function getAttemptClock(attemptId: string) {
  const user = await requireActiveUser();
  const attempt = await loadOwnedAttempt(attemptId, user.id);
  if (!attempt) return null;
  if (attempt.status === "IN_PROGRESS" && isAttemptExpired(attempt, attempt.assessment)) {
    await closeAttempt(attempt.id, { expired: true });
    revalidatePath(`/exams/${attempt.assessmentId}`);
    return { inProgress: false, deadlineAt: null, serverNow: new Date().toISOString() };
  }
  return {
    inProgress: attempt.status === "IN_PROGRESS",
    deadlineAt: attemptDeadline(attempt, attempt.assessment)?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
  };
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
  if (!Number.isFinite(input.deltaSeconds) || input.deltaSeconds <= 0) return;
  // The browser flushes every 15s; a far larger number is not real time.
  const deltaSeconds = Math.min(Math.round(input.deltaSeconds), 600);
  if (deltaSeconds <= 0) return;
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
      timeSpentSec: deltaSeconds,
    },
    update: {
      firstOpenedAt: existing?.firstOpenedAt ?? now,
      lastOpenedAt: now,
      timeSpentSec: { increment: deltaSeconds },
    },
  });

  if (!existing?.firstOpenedAt) {
    await logIntegrityEvent(input.attemptId, "QUESTION_OPENED", { questionId: input.questionId });
  }
}

// ---------------------------------------------------------------------
// TAB-SWITCH TRACKING. The exam's own tabSwitchLimit decides how many
// are allowed (0 = only record them). `awaySeconds` is how long the page
// was hidden: a glance at a notification is not counted.
// ---------------------------------------------------------------------

export async function recordTabSwitch(attemptId: string, awaySeconds?: number) {
  const user = await requireActiveUser();
  if (typeof awaySeconds === "number" && awaySeconds < TAB_SWITCH_MIN_AWAY_SECONDS) return;

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { select: { tabSwitchDetection: true, tabSwitchLimit: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return;
  if (attempt.status !== "IN_PROGRESS" || !attempt.assessment.tabSwitchDetection) return;

  const limit = attempt.assessment.tabSwitchLimit;
  const tabSwitchCount = attempt.tabSwitchCount + 1;
  const shouldDisqualify = limit > 0 && tabSwitchCount >= limit;
  const wasDisqualified = shouldDisqualify || attempt.wasDisqualified;
  const { level, reasons } = computeRisk({ ...attempt, tabSwitchCount, wasDisqualified });

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: { tabSwitchCount, wasDisqualified, riskLevel: level, riskReasons: reasons },
  });
  await logIntegrityEvent(attemptId, "TAB_SWITCH", {
    tabSwitchCount,
    ...(typeof awaySeconds === "number" ? { awaySeconds: Math.round(awaySeconds) } : {}),
  });

  if (shouldDisqualify) {
    await logIntegrityEvent(attemptId, "DISQUALIFIED", { reason: "tab_switch_threshold" });
    await closeAttempt(attemptId, { disqualified: true });
    revalidatePath(`/exams/${attempt.assessmentId}`);
  }

  return { tabSwitchCount, limit, disqualified: shouldDisqualify };
}

// ---------------------------------------------------------------------
// WINDOW FOCUS / BLUR (finer-grained than the tab-switch counter above
// — purely informational for the timeline, never disqualifying).
// ---------------------------------------------------------------------

export async function recordWindowFocusChange(attemptId: string, focused: boolean) {
  const user = await requireActiveUser();
  const attempt = await loadOwnedAttempt(attemptId, user.id);
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
    await logIntegrityEvent(attemptId, "DISQUALIFIED", { reason: "fullscreen_exit" });
    await closeAttempt(attemptId, { disqualified: true });
    revalidatePath(`/exams/${attempt.assessmentId}`);
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
  const attempt = await loadOwnedAttempt(attemptId, user.id);
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

  const userAgent = (await headers()).get("user-agent") ?? "unknown";
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
// SUBMIT. Grading lives in server/services/attempt-grading.ts, shared
// with the expiry sweep and manual grading.
// ---------------------------------------------------------------------

export type SubmitAttemptResult = { ok: true } | { ok: false; error: string };

export async function submitAttempt(attemptId: string): Promise<SubmitAttemptResult> {
  const user = await requireActiveUser();
  const attempt = await loadOwnedAttempt(attemptId, user.id);
  if (!attempt) return { ok: false, error: "Attempt not found." };
  // Already closed (a second click, or the server closed it at time-up):
  // nothing left to do, and not an error for the student.
  if (attempt.status !== "IN_PROGRESS") return { ok: true };

  await closeAttempt(attemptId, { expired: isAttemptExpired(attempt, attempt.assessment) });
  revalidatePath(`/exams/${attempt.assessmentId}`);
  return { ok: true };
}
