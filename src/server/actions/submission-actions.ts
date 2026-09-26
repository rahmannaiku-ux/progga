"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireCompletedProfile } from "@/lib/auth/require-auth";

export async function submitAssignment(input: {
  assignmentId: string;
  fileUrls: string[];
  comment: string;
}) {
  const user = await requireCompletedProfile();

  const assignment = await db.assignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      dueAt: true,
      allowLateSubmission: true,
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
    },
  });
  if (!assignment?.lesson) throw new Error("Challenge not found.");
  const courseId = assignment.lesson.group.chapter.module.courseId;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) throw new Error("You need to enroll in this mission first.");

  if (input.fileUrls.length === 0) {
    throw new Error("Attach at least one file before submitting.");
  }

  // Never trust submitted file URLs directly — each one must be a real
  // upload this exact student made for an assignment submission.
  // Without this, a student could submit an arbitrary URL (or another
  // student's uploaded file, if the URL were guessable) as "proof" of
  // work that was never actually done or uploaded by them.
  const uploads = await db.upload.findMany({ where: { url: { in: input.fileUrls } } });
  if (uploads.length !== input.fileUrls.length) {
    throw new Error("One or more files weren't recognized — try re-uploading them.");
  }
  for (const upload of uploads) {
    if (upload.uploaderId !== user.id || upload.context !== "ASSIGNMENT_SUBMISSION") {
      throw new Error("You can only submit files you uploaded yourself.");
    }
  }

  const now = new Date();
  const isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
  if (isLate && !assignment.allowLateSubmission) {
    throw new Error("The deadline has passed and late submissions aren't allowed.");
  }

  // Resubmitting before grading overwrites the previous submission;
  // resubmitting after grading is blocked to protect the mentor's grade.
  const existing = await db.assignmentSubmission.findUnique({
    where: { assignmentId_userId: { assignmentId: input.assignmentId, userId: user.id } },
  });
  if (existing?.status === "GRADED") {
    throw new Error("This challenge has already been graded and can't be resubmitted.");
  }

  await db.assignmentSubmission.upsert({
    where: { assignmentId_userId: { assignmentId: input.assignmentId, userId: user.id } },
    create: {
      assignmentId: input.assignmentId,
      userId: user.id,
      fileUrls: input.fileUrls,
      comment: input.comment || null,
      status: isLate ? "LATE" : "SUBMITTED",
      submittedAt: now,
    },
    update: {
      fileUrls: input.fileUrls,
      comment: input.comment || null,
      status: isLate ? "LATE" : "SUBMITTED",
      submittedAt: now,
    },
  });

  await db.upload.updateMany({
    where: { url: { in: input.fileUrls } },
    data: { consumedAt: now },
  });

  revalidatePath(`/challenges/${input.assignmentId}`);
}
