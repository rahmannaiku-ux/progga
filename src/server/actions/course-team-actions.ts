"use server";

import { revalidatePath } from "next/cache";
import { revalidateMissionPage } from "@/lib/mission-paths";
import { db } from "@/lib/db/client";
import { notifyAdminsOfCoMentorRequest } from "@/lib/course-team/notify";
import { requireActiveUser, requireAdminUser } from "./require-user";
import { assertOwnsCourse } from "./mission-actions";

/**
 * Sharing a mission between mentors.
 *
 * The mission's main mentor asks for another mentor to join; that is only a
 * request until an admin approves it (admins can also add a mentor straight
 * away). Approving creates the CourseTeacher row that gives the mentor access
 * everywhere (see lib/auth/course-access.ts). These actions return
 * `{ ok: false, error }` instead of throwing so the message reaches the user.
 */

export type TeamResult = { ok: true; message: string } | { ok: false; error: string };

const isAdminRole = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

function refresh(courseId: string, slug: string) {
  revalidateMissionPage(`/${courseId}/team`);
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/admin/co-mentor-requests");
}

/** Asks for (or, for an admin, directly makes) another mentor a co-mentor on this mission. */
export async function addCourseTeacher(courseId: string, formData: FormData): Promise<TeamResult> {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const teacherId = String(formData.get("teacherId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "").trim().slice(0, 80);
  if (!teacherId) return { ok: false, error: "Choose a mentor to add." };

  const [course, candidate] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      select: { slug: true, title: true, teacherId: true, courseTeachers: { select: { teacherId: true } } },
    }),
    db.user.findUnique({
      where: { id: teacherId },
      select: { id: true, role: true, isActive: true, isSuspended: true },
    }),
  ]);
  if (!course) return { ok: false, error: "Mission not found." };

  const admin = isAdminRole(user.role);
  if (!admin && course.teacherId !== user.id) {
    return { ok: false, error: "Only the mission's main mentor can ask for another mentor." };
  }
  if (!candidate || candidate.role !== "TEACHER" || !candidate.isActive || candidate.isSuspended) {
    return { ok: false, error: "That account isn't an active mentor." };
  }
  if (candidate.id === course.teacherId || course.courseTeachers.some((ct) => ct.teacherId === candidate.id)) {
    return { ok: false, error: "That mentor is already on this mission." };
  }

  if (admin) {
    await db.$transaction([
      db.courseTeacher.create({
        data: { courseId, teacherId, roleLabel: roleLabel || null, addedById: user.id },
      }),
      db.courseTeacherRequest.deleteMany({ where: { courseId, teacherId } }),
    ]);
    await db.notification.create({
      data: {
        userId: teacherId,
        type: "SYSTEM",
        title: "You were added to a mission",
        body: `You can now manage "${course.title}" together with its mentors.`,
        linkUrl: `/mentor/missions/${courseId}/builder`,
      },
    });
    await db.activityLog.create({
      data: { userId: user.id, action: "CREATE", entityType: "CourseTeacher", entityId: courseId },
    });
    refresh(courseId, course.slug);
    return { ok: true, message: "Mentor added." };
  }

  const existing = await db.courseTeacherRequest.findUnique({
    where: { courseId_teacherId: { courseId, teacherId } },
    select: { status: true },
  });
  if (existing?.status === "PENDING") {
    return { ok: false, error: "That mentor is already waiting for an admin's approval." };
  }

  await db.courseTeacherRequest.upsert({
    where: { courseId_teacherId: { courseId, teacherId } },
    create: { courseId, teacherId, roleLabel: roleLabel || null, requestedById: user.id },
    update: {
      status: "PENDING",
      roleLabel: roleLabel || null,
      requestedById: user.id,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    },
  });
  await notifyAdminsOfCoMentorRequest({ courseTitle: course.title, count: 1 });

  refresh(courseId, course.slug);
  return { ok: true, message: "Request sent. An admin will review it before the mentor gets access." };
}

/** Withdraws a request (any status). Only the main mentor or an admin. */
export async function cancelCourseTeacherRequest(courseId: string, requestId: string): Promise<TeamResult> {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, request] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true, teacherId: true } }),
    db.courseTeacherRequest.findUnique({ where: { id: requestId }, select: { courseId: true, status: true } }),
  ]);
  if (!course) return { ok: false, error: "Mission not found." };
  if (!isAdminRole(user.role) && course.teacherId !== user.id) {
    return { ok: false, error: "Only the mission's main mentor can do that." };
  }
  if (!request || request.courseId !== courseId) return { ok: false, error: "That request doesn't belong to this mission." };
  if (request.status === "APPROVED") return { ok: false, error: "That request was already approved." };

  await db.courseTeacherRequest.delete({ where: { id: requestId } });
  refresh(courseId, course.slug);
  return { ok: true, message: "Request removed." };
}

/** Removes a co-mentor. The main mentor or an admin can remove anyone; a co-mentor can only leave. */
export async function removeCourseTeacher(courseId: string, courseTeacherId: string): Promise<TeamResult> {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, assignment] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true, teacherId: true } }),
    db.courseTeacher.findUnique({ where: { id: courseTeacherId }, select: { courseId: true, teacherId: true } }),
  ]);
  if (!course) return { ok: false, error: "Mission not found." };
  if (!assignment || assignment.courseId !== courseId) {
    return { ok: false, error: "That assignment doesn't belong to this mission." };
  }
  const canManage = isAdminRole(user.role) || course.teacherId === user.id;
  if (!canManage && assignment.teacherId !== user.id) {
    return { ok: false, error: "Only the mission's main mentor can remove other mentors." };
  }

  await db.$transaction([
    db.courseTeacher.delete({ where: { id: courseTeacherId } }),
    // Forget the old approval so adding them again asks an admin again.
    db.courseTeacherRequest.deleteMany({ where: { courseId, teacherId: assignment.teacherId } }),
  ]);
  await db.activityLog.create({
    data: { userId: user.id, action: "DELETE", entityType: "CourseTeacher", entityId: courseId },
  });

  refresh(courseId, course.slug);
  return { ok: true, message: "Removed from the mission." };
}

/** Admin: approve a request. Gives the mentor access to the mission. */
export async function approveCourseTeacherRequest(requestId: string): Promise<TeamResult> {
  const admin = await requireAdminUser();

  const request = await db.courseTeacherRequest.findUnique({
    where: { id: requestId },
    include: {
      course: { select: { id: true, slug: true, title: true, teacherId: true } },
      teacher: { select: { role: true, isActive: true, isSuspended: true } },
    },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (request.status !== "PENDING") return { ok: false, error: "That request was already reviewed." };
  if (request.teacher.role !== "TEACHER" || !request.teacher.isActive || request.teacher.isSuspended) {
    return { ok: false, error: "That account isn't an active mentor any more." };
  }

  try {
    await db.$transaction(async (tx) => {
      // Only the admin who flips PENDING -> APPROVED goes on to create the access.
      const claim = await tx.courseTeacherRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date() },
      });
      if (claim.count !== 1) throw new Error("ALREADY_REVIEWED");
      if (request.teacherId !== request.course.teacherId) {
        await tx.courseTeacher.upsert({
          where: { courseId_teacherId: { courseId: request.courseId, teacherId: request.teacherId } },
          create: {
            courseId: request.courseId,
            teacherId: request.teacherId,
            roleLabel: request.roleLabel,
            addedById: request.requestedById,
          },
          update: {},
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_REVIEWED") {
      return { ok: false, error: "Another admin just reviewed that request." };
    }
    throw err;
  }

  await db.notification.createMany({
    data: [
      {
        userId: request.teacherId,
        type: "SYSTEM" as const,
        title: "You were added to a mission",
        body: `You can now manage "${request.course.title}" together with its mentors.`,
        linkUrl: `/mentor/missions/${request.courseId}/builder`,
      },
      {
        userId: request.requestedById,
        type: "SYSTEM" as const,
        title: "Co-mentor request approved",
        body: `Your request to share "${request.course.title}" was approved.`,
        linkUrl: `/mentor/missions/${request.courseId}/team`,
      },
    ],
  });
  await db.activityLog.create({
    data: { userId: admin.id, action: "CREATE", entityType: "CourseTeacher", entityId: request.courseId },
  });

  refresh(request.courseId, request.course.slug);
  return { ok: true, message: "Approved." };
}

/** Admin: turn a request down, with a short reason the requesting mentor will see. */
export async function rejectCourseTeacherRequest(requestId: string, reason: string): Promise<TeamResult> {
  const admin = await requireAdminUser();

  const request = await db.courseTeacherRequest.findUnique({
    where: { id: requestId },
    include: { course: { select: { id: true, slug: true, title: true } } },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };

  const cleanReason = String(reason ?? "").trim().slice(0, 300);
  const claim = await db.courseTeacherRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedById: admin.id,
      reviewedAt: new Date(),
      rejectionReason: cleanReason || null,
    },
  });
  if (claim.count !== 1) return { ok: false, error: "That request was already reviewed." };

  await db.notification.create({
    data: {
      userId: request.requestedById,
      type: "SYSTEM",
      title: "Co-mentor request declined",
      body: `Your request to share "${request.course.title}" was declined${cleanReason ? `: ${cleanReason}` : "."}`,
      linkUrl: `/mentor/missions/${request.courseId}/team`,
    },
  });

  refresh(request.courseId, request.course.slug);
  return { ok: true, message: "Declined." };
}
