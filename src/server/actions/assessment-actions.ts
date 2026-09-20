"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  assessmentCreateSchema,
  assessmentUpdateSchema,
  questionCreateSchema,
  validateQuestionBusinessRules,
} from "@/lib/validation/assessment";
import { buildQuestionCreateData } from "@/server/services/question-bank";
import { awardXp } from "@/lib/gamification/award-xp";
import { checkEncounterAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import { isPassing, summarizeAttemptScore } from "@/lib/grading";
import { requireMentorUser } from "./require-user";
import { parseOptionalDhakaInput } from "@/lib/timezone";

async function assertOwnsCourse(courseId: string, userId: string, role: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true },
  });
  if (!course) throw new Error("Mission not found.");
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  if (!isAdmin && course.teacherId !== userId) {
    throw new Error("You don't have access to this mission.");
  }
}

/**
 * Course-level exam feature gate — a course must have exams explicitly
 * turned on (Course.examsEnabled) before a teacher can create OR
 * publish an assessment for it, and before any student can reach one.
 * Checked here (creation/publish) and separately in
 * attempt-actions.ts's assertAccessToAssessment (student access) —
 * both server-side, never just a hidden "Exams" tab.
 */
async function assertExamsEnabledForCourse(courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { examsEnabled: true } });
  if (!course?.examsEnabled) {
    throw new Error("Exams aren't enabled for this mission yet — turn them on in mission settings first.");
  }
}

async function assertOwnsAssessment(assessmentId: string, userId: string, role: string) {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      courseId: true,
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
      chapter: { select: { module: { select: { courseId: true } } } },
    },
  });
  if (!assessment) throw new Error("Encounter not found.");
  const courseId =
    assessment.courseId ?? assessment.chapter?.module.courseId ?? assessment.lesson?.group.chapter.module.courseId;
  if (!courseId) throw new Error("Encounter isn't linked to a mission.");
  await assertOwnsCourse(courseId, userId, role);
  return courseId;
}

/**
 * Chapter placement (PHASE 4/18) must belong to the SAME course as the
 * exam itself — otherwise a teacher could place one course's exam
 * inside another course's learning path, which would leak that course's
 * exam into a chapter its enrolled students may not have purchased.
 */
async function assertChapterBelongsToCourse(chapterId: string, courseId: string) {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { module: { select: { courseId: true } } },
  });
  if (!chapter || chapter.module.courseId !== courseId) {
    throw new Error("That chapter doesn't belong to this mission.");
  }
}

/**
 * Verifies `questionId` is actually attached to `assessmentId` via the
 * AssessmentQuestion join — without this, a teacher who owns SOME
 * assessment could pass its id alongside another teacher's questionId
 * and detach/modify a question link that isn't theirs. Mirrors the same
 * class of chain-of-ownership bug fixed in mission-actions.ts for
 * modules/chapters/lessons.
 */
async function assertQuestionAttachedToAssessment(questionId: string, assessmentId: string) {
  const link = await db.assessmentQuestion.findUnique({
    where: { assessmentId_questionId: { assessmentId, questionId } },
  });
  if (!link) throw new Error("That question isn't attached to this encounter.");
  return link;
}

// ---------------------------------------------------------------------
// ASSESSMENT
// ---------------------------------------------------------------------

export async function createAssessment(formData: FormData) {
  const user = await requireMentorUser("Only mentors can author encounters.");

  const parsed = assessmentCreateSchema.safeParse({
    courseId: formData.get("courseId"),
    lessonId: formData.get("lessonId"),
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
    kind: formData.get("kind"),
    // FormData.get() returns null (not undefined) when a field isn't
    // present in the submitted form — this create form only sends
    // title/kind/lessonId/chapterId, so instructions/monitoring/access
    // fields are always absent here. The schema's
    // `.optional().or(z.literal(""))` accepts undefined or "", but not
    // null, so raw null was tripping Zod's generic union-mismatch error
    // ("Invalid input") on every submission. `|| undefined` normalizes
    // null (and "") the same way the other optional fields below do.
    instructions: formData.get("instructions") || undefined,
    timeLimitSeconds: formData.get("timeLimitSeconds") || undefined,
    randomizeQuestions: formData.get("randomizeQuestions") === "on",
    questionBankSize: formData.get("questionBankSize") || undefined,
    negativeMarkingRatio: formData.get("negativeMarkingRatio") || 0,
    fullscreenRequired: formData.get("fullscreenRequired") === "on",
    tabSwitchDetection: formData.get("tabSwitchDetection") === "on",
    lockAnswersAfterSelection: formData.get("lockAnswersAfterSelection") === "on",
    detectCopyPaste: formData.get("detectCopyPaste") === "on",
    detectScreenshotAttempts: formData.get("detectScreenshotAttempts") === "on",
    detectSessionAnomalies: formData.get("detectSessionAnomalies") === "on",
    fullscreenExitAction: formData.get("fullscreenExitAction") || "WARNING",
    maxAttempts: formData.get("maxAttempts") || 1,
    passPercentage: formData.get("passPercentage") || 60,
    showResultsInstantly: formData.get("showResultsInstantly") === "on",
    isLiveExam: formData.get("isLiveExam") === "on",
    // Same null-vs-undefined issue as `instructions` above.
    monitoringStartsAt: formData.get("monitoringStartsAt") || undefined,
    monitoringEndsAt: formData.get("monitoringEndsAt") || undefined,
    accessOpensAt: formData.get("accessOpensAt") || undefined,
    accessClosesAt: formData.get("accessClosesAt") || undefined,
    coinReward: formData.get("coinReward") || 0,
    minimumScoreForCoinReward: formData.get("minimumScoreForCoinReward") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid encounter details");
  }
  const data = parsed.data;
  await assertOwnsCourse(data.courseId, user.id, user.role);
  if (data.chapterId) await assertChapterBelongsToCourse(data.chapterId, data.courseId);

  const assessment = await db.assessment.create({
    data: {
      courseId: data.courseId,
      lessonId: data.lessonId || null,
      chapterId: data.chapterId || null,
      title: data.title,
      kind: data.kind,
      instructions: data.instructions || null,
      timeLimitSeconds: data.timeLimitSeconds || null,
      randomizeQuestions: data.randomizeQuestions,
      questionBankSize: data.questionBankSize || null,
      negativeMarkingRatio: data.negativeMarkingRatio,
      fullscreenRequired: data.fullscreenRequired,
      tabSwitchDetection: data.tabSwitchDetection,
      lockAnswersAfterSelection: data.lockAnswersAfterSelection,
      detectCopyPaste: data.detectCopyPaste,
      detectScreenshotAttempts: data.detectScreenshotAttempts,
      detectSessionAnomalies: data.detectSessionAnomalies,
      fullscreenExitAction: data.fullscreenExitAction,
      maxAttempts: data.maxAttempts,
      passPercentage: data.passPercentage,
      showResultsInstantly: data.showResultsInstantly,
      isLiveExam: data.isLiveExam,
      monitoringStartsAt: parseOptionalDhakaInput(data.monitoringStartsAt),
      monitoringEndsAt: parseOptionalDhakaInput(data.monitoringEndsAt),
      accessOpensAt: parseOptionalDhakaInput(data.accessOpensAt),
      accessClosesAt: parseOptionalDhakaInput(data.accessClosesAt),
      coinReward: data.coinReward,
      minimumScoreForCoinReward: data.minimumScoreForCoinReward || null,
    },
  });

  redirect(`/mentor/missions/${data.courseId}/assessments/${assessment.id}`);
}

export async function updateAssessment(assessmentId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  const parsed = assessmentUpdateSchema.safeParse({
      chapterId: formData.get("chapterId"),
      title: formData.get("title"),
      kind: formData.get("kind"),
      // See the comment in createAssessment above — `|| undefined` guards
      // against FormData.get() returning null (rather than undefined)
      // for a field the form omits or leaves blank.
      instructions: formData.get("instructions") || undefined,
      timeLimitSeconds: formData.get("timeLimitSeconds") || undefined,
      randomizeQuestions: formData.get("randomizeQuestions") === "on",
      questionBankSize: formData.get("questionBankSize") || undefined,
      negativeMarkingRatio: formData.get("negativeMarkingRatio") || 0,
      fullscreenRequired: formData.get("fullscreenRequired") === "on",
      tabSwitchDetection: formData.get("tabSwitchDetection") === "on",
      lockAnswersAfterSelection: formData.get("lockAnswersAfterSelection") === "on",
      detectCopyPaste: formData.get("detectCopyPaste") === "on",
      detectScreenshotAttempts: formData.get("detectScreenshotAttempts") === "on",
      detectSessionAnomalies: formData.get("detectSessionAnomalies") === "on",
      fullscreenExitAction: formData.get("fullscreenExitAction") || "WARNING",
      maxAttempts: formData.get("maxAttempts") || 1,
      passPercentage: formData.get("passPercentage") || 60,
      showResultsInstantly: formData.get("showResultsInstantly") === "on",
      isLiveExam: formData.get("isLiveExam") === "on",
      monitoringStartsAt: formData.get("monitoringStartsAt") || undefined,
      monitoringEndsAt: formData.get("monitoringEndsAt") || undefined,
      accessOpensAt: formData.get("accessOpensAt") || undefined,
      accessClosesAt: formData.get("accessClosesAt") || undefined,
      coinReward: formData.get("coinReward") || 0,
      minimumScoreForCoinReward: formData.get("minimumScoreForCoinReward") || undefined,
    });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid encounter details");
  }
  const data = parsed.data;
  if (data.chapterId) await assertChapterBelongsToCourse(data.chapterId, courseId);

  await db.assessment.update({
    where: { id: assessmentId },
    data: {
      chapterId: data.chapterId || null,
      title: data.title,
      kind: data.kind,
      instructions: data.instructions || null,
      timeLimitSeconds: data.timeLimitSeconds || null,
      randomizeQuestions: data.randomizeQuestions,
      questionBankSize: data.questionBankSize || null,
      negativeMarkingRatio: data.negativeMarkingRatio,
      fullscreenRequired: data.fullscreenRequired,
      tabSwitchDetection: data.tabSwitchDetection,
      lockAnswersAfterSelection: data.lockAnswersAfterSelection,
      detectCopyPaste: data.detectCopyPaste,
      detectScreenshotAttempts: data.detectScreenshotAttempts,
      detectSessionAnomalies: data.detectSessionAnomalies,
      fullscreenExitAction: data.fullscreenExitAction,
      maxAttempts: data.maxAttempts,
      passPercentage: data.passPercentage,
      showResultsInstantly: data.showResultsInstantly,
      isLiveExam: data.isLiveExam,
      monitoringStartsAt: parseOptionalDhakaInput(data.monitoringStartsAt),
      monitoringEndsAt: parseOptionalDhakaInput(data.monitoringEndsAt),
      accessOpensAt: parseOptionalDhakaInput(data.accessOpensAt),
      accessClosesAt: parseOptionalDhakaInput(data.accessClosesAt),
      coinReward: data.coinReward,
      minimumScoreForCoinReward: data.minimumScoreForCoinReward || null,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
}

export async function setAssessmentPublishState(assessmentId: string, publish: boolean) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  if (publish) {
    await assertExamsEnabledForCourse(courseId);
    const qCount = await db.assessmentQuestion.count({ where: { assessmentId } });
    if (qCount === 0) throw new Error("Add at least one question before publishing.");
  }

  await db.assessment.update({
    where: { id: assessmentId },
    data: { publishedAt: publish ? new Date() : null },
  });

  revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
}

export async function deleteAssessment(assessmentId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  const attemptCount = await db.assessmentAttempt.count({ where: { assessmentId } });
  if (attemptCount > 0) {
    throw new Error(
      `This encounter has ${attemptCount} recorded attempt${attemptCount === 1 ? "" : "s"} — ` +
        "it can't be deleted, since that would destroy students' historical scores. Unpublish it instead."
    );
  }

  // Bank questions attached to this assessment are untouched — deleting
  // an exam only removes its AssessmentQuestion links (cascades
  // automatically), never the reusable questions themselves.
  await db.assessment.delete({ where: { id: assessmentId } });
  revalidatePath(`/mentor/missions/${courseId}/assessments`);
  redirect(`/mentor/missions/${courseId}/assessments`);
}

/**
 * Explicit teacher action to move a live exam into ARCHIVED — the one
 * status in getLiveExamStatus() that's never computed from timestamps
 * alone. Attempts, answers, and analytics are all untouched; this only
 * sets a timestamp that removes the exam from both LIVE EXAMS and the
 * active EXAM HISTORY view (still reachable, just deliberately tucked
 * away, e.g. for an old term's exams).
 */
export async function archiveAssessment(assessmentId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);
  await db.assessment.update({ where: { id: assessmentId }, data: { archivedAt: new Date() } });
  revalidatePath(`/mentor/missions/${courseId}/assessments`);
  revalidatePath("/mentor/live-exams");
}

export async function unarchiveAssessment(assessmentId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);
  await db.assessment.update({ where: { id: assessmentId }, data: { archivedAt: null } });
  revalidatePath(`/mentor/missions/${courseId}/assessments`);
  revalidatePath("/mentor/live-exams");
}

/**
 * PHASE 14 — Duplicate Exam. Copies configuration (timer, marking,
 * security, rewards, placement) and question REFERENCES (via new
 * AssessmentQuestion links to the same bank Question rows — never new
 * Question rows, since the bank is shared/reusable by design). Never
 * copies attempts, answers, integrity events, or reward transactions —
 * the duplicate is a brand-new draft with a clean history. Live-exam
 * scheduling windows are intentionally NOT copied (a duplicate of a
 * scheduled live exam almost certainly needs new times, not the old
 * ones), matching how archivedAt/publishedAt also start fresh.
 */
export async function duplicateAssessment(assessmentId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  const original = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: { questionLinks: { orderBy: { order: "asc" } } },
  });
  if (!original) throw new Error("Encounter not found.");

  const duplicate = await db.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        courseId: original.courseId,
        lessonId: original.lessonId,
        chapterId: original.chapterId,
        title: `${original.title} (copy)`,
        kind: original.kind,
        instructions: original.instructions,
        timeLimitSeconds: original.timeLimitSeconds,
        autoSubmitOnExpiry: original.autoSubmitOnExpiry,
        randomizeQuestions: original.randomizeQuestions,
        questionBankSize: original.questionBankSize,
        negativeMarkingRatio: original.negativeMarkingRatio,
        fullscreenRequired: original.fullscreenRequired,
        tabSwitchDetection: original.tabSwitchDetection,
        maxAttempts: original.maxAttempts,
        lockAnswersAfterSelection: original.lockAnswersAfterSelection,
        detectCopyPaste: original.detectCopyPaste,
        detectScreenshotAttempts: original.detectScreenshotAttempts,
        detectSessionAnomalies: original.detectSessionAnomalies,
        fullscreenExitAction: original.fullscreenExitAction,
        passPercentage: original.passPercentage,
        showResultsInstantly: original.showResultsInstantly,
        requiresTeacherReview: original.requiresTeacherReview,
        coinReward: original.coinReward,
        minimumScoreForCoinReward: original.minimumScoreForCoinReward,
        rewardCoinsOnce: original.rewardCoinsOnce,
        // Deliberately NOT copied: publishedAt, archivedAt, isLiveExam +
        // its windows — see docstring above.
      },
    });

    if (original.questionLinks.length > 0) {
      await tx.assessmentQuestion.createMany({
        data: original.questionLinks.map((link) => ({
          assessmentId: created.id,
          questionId: link.questionId,
          order: link.order,
        })),
      });
    }
    return created;
  });

  revalidatePath(`/mentor/missions/${courseId}/assessments`);
  revalidatePath("/mentor/exam-history");
  redirect(`/mentor/missions/${courseId}/assessments/${duplicate.id}`);
}

// ---------------------------------------------------------------------
// QUESTIONS — bank-owned, reusable across every exam in their course.
// ---------------------------------------------------------------------

/**
 * Creates a new bank question AND attaches it to `assessmentId` in one
 * step — the existing "add a question" UI lives inside one assessment's
 * editor, so this keeps that flow working unchanged while the
 * underlying model is now bank-first. A question created here is
 * immediately reusable in other exams for the same course afterward via
 * addExistingQuestionToAssessment.
 */
export async function createQuestion(formData: FormData) {
  const user = await requireMentorUser("Only mentors can author encounters.");

  const rawOptions = formData.getAll("options").map(String).filter((s) => s.trim());
  const rawCorrect = formData.getAll("correctIndexes").map((s) => Number(s));
  const rawTags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const parsed = questionCreateSchema.safeParse({
    assessmentId: formData.get("assessmentId"),
    type: formData.get("type"),
    prompt: formData.get("prompt"),
    points: formData.get("points") || 1,
    explanation: formData.get("explanation"),
    topic: formData.get("topic"),
    difficulty: formData.get("difficulty") || "MEDIUM",
    tags: rawTags,
    options: rawOptions,
    correctIndexes: rawCorrect,
    numericAnswer: formData.get("numericAnswer") || undefined,
    numericTolerance: formData.get("numericTolerance") || 0,
    numericUnit: formData.get("numericUnit"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid question");
  }
  const data = parsed.data;
  const courseId = await assertOwnsAssessment(data.assessmentId, user.id, user.role);

  const validationError = validateQuestionBusinessRules(data);
  if (validationError) throw new Error(validationError);

  const maxOrder = await db.assessmentQuestion.aggregate({
    where: { assessmentId: data.assessmentId },
    _max: { order: true },
  });

  await db.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: buildQuestionCreateData(courseId, user.id, data),
    });

    await tx.assessmentQuestion.create({
      data: {
        assessmentId: data.assessmentId,
        questionId: question.id,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  });

  // Essay/short-answer require manual review — flag the assessment.
  if (data.type === "ESSAY" || data.type === "SHORT_ANSWER") {
    await db.assessment.update({
      where: { id: data.assessmentId },
      data: { requiresTeacherReview: true },
    });
  }

  revalidatePath(`/mentor/missions/${courseId}/assessments/${data.assessmentId}`);
}

/**
 * Attaches an EXISTING bank question to another exam — this is the
 * actual reuse path (createQuestion always makes a brand new question).
 * Both exams must belong to the same course as the question, and the
 * caller must own that course.
 */
export async function addExistingQuestionToAssessment(assessmentId: string, questionId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  const question = await db.question.findUnique({ where: { id: questionId }, select: { courseId: true } });
  if (!question || question.courseId !== courseId) {
    throw new Error("That question isn't in this mission's question bank.");
  }

  const maxOrder = await db.assessmentQuestion.aggregate({
    where: { assessmentId },
    _max: { order: true },
  });

  await db.assessmentQuestion.upsert({
    where: { assessmentId_questionId: { assessmentId, questionId } },
    create: { assessmentId, questionId, order: (maxOrder._max.order ?? -1) + 1 },
    update: {}, // already attached — no-op rather than an error, so a double-click is harmless
  });

  revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
}

/**
 * Detaches a question from ONE exam — the bank question itself, and its
 * presence in any OTHER exam, is untouched. This is what the existing
 * "remove question" button in the assessment editor now does; it is
 * NOT bank deletion (see deleteBankQuestion for that).
 */
export async function deleteQuestion(assessmentId: string, questionId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);
  await assertQuestionAttachedToAssessment(questionId, assessmentId);

  const answerCount = await db.questionAnswer.count({
    where: { questionId, attempt: { assessmentId } },
  });
  if (answerCount > 0) {
    throw new Error(
      "Students have already answered this question in a recorded attempt on this encounter — " +
        "it can't be removed, since that would corrupt their historical scores. Unpublish the encounter instead."
    );
  }

  await db.assessmentQuestion.delete({
    where: { assessmentId_questionId: { assessmentId, questionId } },
  });
  revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
}

/**
 * True bank deletion — only allowed once the question isn't attached to
 * ANY exam (the AssessmentQuestion FK is onDelete: Restrict specifically
 * so this can't be bypassed accidentally) and has never been answered.
 */
export async function deleteBankQuestion(questionId: string) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const question = await db.question.findUnique({
    where: { id: questionId },
    select: { courseId: true, _count: { select: { assessmentLinks: true, answers: true } } },
  });
  if (!question) throw new Error("Question not found.");
  await assertOwnsCourse(question.courseId, user.id, user.role);

  if (question._count.assessmentLinks > 0) {
    throw new Error("Remove this question from every exam it's used in before deleting it from the bank.");
  }
  if (question._count.answers > 0) {
    throw new Error("This question has recorded student answers and can't be deleted.");
  }

  await db.question.delete({ where: { id: questionId } });
  revalidatePath(`/mentor/missions/${question.courseId}/question-bank`);
}

/**
 * Swaps this question's position with its neighbor in the exam's order —
 * simple adjacent-swap reordering rather than accepting an arbitrary
 * target index, so two concurrent reorders can't leave gaps or
 * duplicate order values.
 */
export async function moveQuestionInAssessment(
  assessmentId: string,
  questionId: string,
  direction: "up" | "down"
) {
  const user = await requireMentorUser("Only mentors can author encounters.");
  const courseId = await assertOwnsAssessment(assessmentId, user.id, user.role);

  const links = await db.assessmentQuestion.findMany({
    where: { assessmentId },
    orderBy: { order: "asc" },
  });
  const index = links.findIndex((l) => l.questionId === questionId);
  if (index === -1) throw new Error("That question isn't attached to this encounter.");

  const swapWithIndex = direction === "up" ? index - 1 : index + 1;
  if (swapWithIndex < 0 || swapWithIndex >= links.length) return; // already at the edge — no-op

  const a = links[index]!;
  const b = links[swapWithIndex]!;

  await db.$transaction([
    // Swap through a temporary negative value first — order has no
    // uniqueness constraint, so this isn't strictly required for
    // correctness, but it avoids a brief state where two rows could
    // read as identically-ordered mid-transaction if this ever gains one.
    db.assessmentQuestion.update({ where: { id: a.id }, data: { order: -1 } }),
    db.assessmentQuestion.update({ where: { id: b.id }, data: { order: a.order } }),
    db.assessmentQuestion.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);

  revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
}

// ---------------------------------------------------------------------
// MANUAL GRADING (essay / short-answer)
// ---------------------------------------------------------------------

export async function gradeWrittenAnswer(input: {
  answerId: string;
  pointsAwarded: number;
  teacherFeedback?: string;
}) {
  const user = await requireMentorUser("Only mentors can author encounters.");

  const answer = await db.questionAnswer.findUnique({
    where: { id: input.answerId },
    include: {
      question: { select: { points: true } },
      attempt: { select: { id: true, assessmentId: true, maxScore: true } },
    },
  });
  if (!answer) throw new Error("Answer not found.");
  await assertOwnsAssessment(answer.attempt.assessmentId, user.id, user.role);

  const clamped = Math.max(0, Math.min(input.pointsAwarded, answer.question.points));

  await db.questionAnswer.update({
    where: { id: input.answerId },
    data: {
      pointsAwarded: clamped,
      isCorrect: clamped > 0,
      teacherFeedback: input.teacherFeedback || null,
      gradedAt: new Date(),
      isAutoGraded: false,
    },
  });

  await recomputeAttemptIfFullyGraded(answer.attempt.id);
  revalidatePath(`/mentor/grading/exams`);
}

async function recomputeAttemptIfFullyGraded(attemptId: string) {
  const answers = await db.questionAnswer.findMany({
    where: { attemptId },
    include: { question: { select: { points: true, type: true } } },
  });

  const stillPending = answers.some(
    (a) =>
      (a.question.type === "ESSAY" || a.question.type === "SHORT_ANSWER") &&
      a.gradedAt === null
  );
  if (stillPending) return;

  const { rawScore, maxScore, percentage } = summarizeAttemptScore(
    answers.map((a) => ({ pointsAwarded: a.pointsAwarded ?? 0, questionPoints: a.question.points }))
  );

  const attemptWithAssessment = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { assessment: { select: { passPercentage: true } } },
  });

  const isPassed = isPassing(percentage, attemptWithAssessment?.assessment.passPercentage ?? 60);

  await db.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      status: "GRADED",
      rawScore,
      maxScore,
      percentage,
      isPassed,
    },
  });

  const attemptWithUser = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, assessment: { select: { kind: true } } },
  });
  if (attemptWithUser) {
    if (isPassed) {
      await awardXp(
        attemptWithUser.userId,
        attemptWithUser.assessment.kind === "EXAM" ? XP_REWARDS.EXAM_PASSED : XP_REWARDS.QUIZ_PASSED,
        {
          type: "ASSESSMENT_ATTEMPT",
          id: attemptId,
          rewardType: attemptWithUser.assessment.kind === "EXAM" ? "EXAM_PASSED" : "QUIZ_PASSED",
        }
      );
    }
    await checkEncounterAchievements(attemptWithUser.userId, { isPassed, percentage });
  }
}
