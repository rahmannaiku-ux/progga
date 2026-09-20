"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { assignmentCreateSchema } from "@/lib/validation/assignment";
import { awardXp } from "@/lib/gamification/award-xp";
import { awardCoins } from "@/lib/gamification/coins";
import { checkAssignmentAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import { sendTemplatedEmail } from "@/lib/email/send-email";
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

async function assertOwnsAssignment(assignmentId: string, userId: string, role: string) {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
    },
  });
  if (!assignment?.lesson) throw new Error("Challenge not found.");
  const courseId = assignment.lesson.group.chapter.module.courseId;
  await assertOwnsCourse(courseId, userId, role);
  return courseId;
}

function buildRubric(criteria: string[], points: number[]) {
  return criteria
    .map((criterion, i) => ({ criterion, points: points[i] ?? 0 }))
    .filter((r) => r.criterion.trim().length > 0);
}

// ---------------------------------------------------------------------
// AUTHORING
// ---------------------------------------------------------------------

export async function createAssignment(formData: FormData) {
  const user = await requireMentorUser("Only mentors can author challenges.");

  const parsed = assignmentCreateSchema.safeParse({
    courseId: formData.get("courseId"),
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueAt: formData.get("dueAt"),
    maxPoints: formData.get("maxPoints") || 100,
    allowLateSubmission: formData.get("allowLateSubmission") === "on",
    rubricCriteria: formData.getAll("rubricCriteria").map(String),
    rubricPoints: formData.getAll("rubricPoints").map(Number),
    coinReward: formData.get("coinReward") || 0,
    xpReward: formData.get("xpReward") || 0,
    maxRewardClaims: formData.get("maxRewardClaims") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid challenge details");
  }
  const data = parsed.data;
  if (!data.lessonId) {
    throw new Error("Attach the challenge to a patrol.");
  }
  await assertOwnsCourse(data.courseId, user.id, user.role);

  const rubric = buildRubric(data.rubricCriteria, data.rubricPoints);

  await db.assignment.create({
    data: {
      lessonId: data.lessonId,
      title: data.title,
      instructions: data.instructions,
      dueAt: parseOptionalDhakaInput(data.dueAt),
      maxPoints: data.maxPoints,
      allowLateSubmission: data.allowLateSubmission,
      rubric: rubric.length > 0 ? rubric : undefined,
      coinReward: data.coinReward,
      xpReward: data.xpReward,
      maxRewardClaims: data.maxRewardClaims || null,
    },
  });

  revalidatePath(`/mentor/missions/${data.courseId}/assignments`);
  redirect(`/mentor/missions/${data.courseId}/assignments`);
}

export async function deleteAssignment(courseId: string, assignmentId: string) {
  const user = await requireMentorUser("Only mentors can author challenges.");
  await assertOwnsAssignment(assignmentId, user.id, user.role);

  const submissionCount = await db.assignmentSubmission.count({ where: { assignmentId } });
  if (submissionCount > 0) {
    throw new Error(
      `This challenge has ${submissionCount} student submission${submissionCount === 1 ? "" : "s"} — ` +
        "it can't be deleted, since that would destroy their work and grades. Unpublish or archive it instead."
    );
  }

  await db.assignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/mentor/missions/${courseId}/assignments`);
}

// ---------------------------------------------------------------------
// GRADING
// ---------------------------------------------------------------------

export async function gradeSubmission(input: {
  submissionId: string;
  rubricScores: { criterion: string; pointsAwarded: number }[];
  overrideGrade?: number;
  feedback: string;
}) {
  const user = await requireMentorUser("Only mentors can author challenges.");

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: input.submissionId },
    include: {
      user: { select: { email: true } },
      assignment: {
        select: {
          title: true,
          maxPoints: true,
          courseId: true,
          coinReward: true,
          xpReward: true,
          maxRewardClaims: true,
          coinRewardClaimsCount: true,
          lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
        },
      },
    },
  });
  if (!submission) throw new Error("Submission not found.");
  const courseId = submission.assignment.courseId ?? submission.assignment.lesson?.group.chapter.module.courseId;
  if (!courseId) throw new Error("Submission not found.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const rubricTotal = input.rubricScores.reduce((sum, r) => sum + r.pointsAwarded, 0);
  const grade =
    input.overrideGrade ??
    (input.rubricScores.length > 0 ? rubricTotal : 0);
  const clamped = Math.max(0, Math.min(grade, submission.assignment.maxPoints));

  await db.assignmentSubmission.update({
    where: { id: input.submissionId },
    data: {
      grade: clamped,
      feedback: input.feedback || null,
      rubricScores: input.rubricScores.length > 0 ? input.rubricScores : undefined,
      status: "GRADED",
      gradedAt: new Date(),
      gradedById: user.id,
    },
  });

  await db.notification.create({
    data: {
      userId: submission.userId,
      type: "GRADE_POSTED",
      title: "Challenge graded",
      body: `You scored ${clamped}/${submission.assignment.maxPoints}.`,
      linkUrl: `/challenges/${submission.assignmentId}`,
    },
  });

  await sendTemplatedEmail(
    "grade-posted",
    submission.user.email,
    {
      assignmentTitle: submission.assignment.title,
      grade: clamped,
      maxPoints: submission.assignment.maxPoints,
    },
    {
      subject: "Your challenge was graded",
      bodyHtml: "<p>You scored {{grade}}/{{maxPoints}} on {{assignmentTitle}}.</p>",
    }
  );

  if (clamped >= submission.assignment.maxPoints * 0.5) {
    await awardXp(
      submission.userId,
      XP_REWARDS.ASSIGNMENT_GRADED_PASS + submission.assignment.xpReward,
      {
        type: "ASSIGNMENT_SUBMISSION",
        id: input.submissionId,
        rewardType: "ASSIGNMENT_GRADED_PASS",
      }
    );

    const { coinReward, maxRewardClaims, coinRewardClaimsCount } = submission.assignment;
    if (coinReward > 0 && (maxRewardClaims === null || coinRewardClaimsCount < maxRewardClaims)) {
      const { awarded } = await awardCoins(submission.userId, coinReward, {
        type: "CHALLENGE_REWARD",
        id: input.submissionId,
        reason: submission.assignment.title,
      });
      if (awarded) {
        // Only consume a claim slot on a genuinely new award — a
        // duplicate/idempotent call (awardCoins already deduped it via
        // its own unique constraint) shouldn't count against the cap.
        await db.assignment.updateMany({
          where: {
            id: submission.assignmentId,
            ...(maxRewardClaims !== null ? { coinRewardClaimsCount: { lt: maxRewardClaims } } : {}),
          },
          data: { coinRewardClaimsCount: { increment: 1 } },
        });
      }
    }
  }
  await checkAssignmentAchievements(submission.userId);

  revalidatePath("/mentor/grading/assignments");
}
