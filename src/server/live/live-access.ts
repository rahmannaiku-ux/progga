import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import type { LiveClass, Role } from "@prisma/client";

/**
 * Centralized Live Room authorization. Mirrors the plan's flow:
 *
 *   Student: session -> active user -> LiveClass exists -> state != CANCELLED
 *            -> Enrollment(userId, courseId).status in {ACTIVE, COMPLETED}
 *            -> not banned -> rate limit -> issue token
 *
 *   Teacher: active user -> role >= TEACHER -> owner/co-teacher/admin
 *            -> state-machine check -> action
 *
 * Deliberately NOT reusing assertCourseEnrollment (src/lib/auth/
 * enrollment-guard.ts): that helper only checks an enrollment ROW
 * exists, not its `status`, and it redirects rather than returning a
 * result -- wrong shape for a JSON API route. This performs its own
 * status-aware lookup with the same underlying query, and never
 * redirects: callers (route handlers, server actions) decide what an
 * unauthorized result means for their response shape.
 *
 * Every check here is server-side. Nothing about the caller's claimed
 * role/id is ever trusted from the browser -- both entry points take
 * only a Proggaa-authenticated `User.id` obtained via requireActiveUser/
 * requireRole further up the call chain.
 */

const ENROLLED_STATUSES = new Set(["ACTIVE", "COMPLETED"]);

export type LiveAccessResult =
  | { ok: true; liveClass: LiveClass }
  | { ok: false; reason: "NOT_FOUND" | "CANCELLED" | "NOT_ENROLLED" | "BANNED" | "RATE_LIMITED" };

/**
 * Student/anyone-with-a-role join check. `role` is only used to let a
 * course's own teacher(s) and admins into the room without an
 * enrollment row (matching how they can already view every other course
 * page) -- everyone else must be actively/completed-enrolled.
 */
export async function assertCanJoinLiveRoom(
  liveClassId: string,
  user: { id: string; role: Role }
): Promise<LiveAccessResult> {
  const liveClass = await db.liveClass.findUnique({ where: { id: liveClassId } });
  if (!liveClass) return { ok: false, reason: "NOT_FOUND" };
  if (liveClass.state === "CANCELLED") return { ok: false, reason: "CANCELLED" };

  const isStaff = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isStaff) {
    const isTeacherOfCourse = await isOwnerOrCoTeacher(liveClass.courseId, user.id);
    if (!isTeacherOfCourse) {
      const enrollment = await db.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: liveClass.courseId } },
        select: { status: true },
      });
      if (!enrollment || !ENROLLED_STATUSES.has(enrollment.status)) {
        return { ok: false, reason: "NOT_ENROLLED" };
      }
    }
  }

  const banned = await isBannedFromLiveClass(liveClassId, user.id);
  if (banned) return { ok: false, reason: "BANNED" };

  const limited = await checkRateLimit("write", `live-join:${user.id}`);
  if (!limited.success) return { ok: false, reason: "RATE_LIMITED" };

  return { ok: true, liveClass };
}

export type ManageAccessResult =
  | { ok: true; liveClass: LiveClass }
  | { ok: false; reason: "NOT_FOUND" | "NOT_AUTHORIZED" };

/** Teacher/admin management check -- create, start, end, cancel, moderate. */
export async function assertCanManageLiveClass(
  liveClassId: string,
  user: { id: string; role: Role }
): Promise<ManageAccessResult> {
  const liveClass = await db.liveClass.findUnique({ where: { id: liveClassId } });
  if (!liveClass) return { ok: false, reason: "NOT_FOUND" };

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin) {
    if (user.role !== "TEACHER") return { ok: false, reason: "NOT_AUTHORIZED" };
    const owns = await isOwnerOrCoTeacher(liveClass.courseId, user.id);
    if (!owns) return { ok: false, reason: "NOT_AUTHORIZED" };
  }

  return { ok: true, liveClass };
}

/** Same ownership rule as assertOwnsCourse (mission-actions.ts): primary teacher OR co-teacher. */
async function isOwnerOrCoTeacher(courseId: string, userId: string): Promise<boolean> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      teacherId: true,
      courseTeachers: { where: { teacherId: userId }, select: { id: true } },
    },
  });
  if (!course) return false;
  return course.teacherId === userId || course.courseTeachers.length > 0;
}

/**
 * Placeholder ban check -- there is no LiveClassBan table yet (out of
 * the approved V1 scope). "Remove" moderation currently means a Stream
 * ban + removeMembers (see server/live/chat/provider.ts) which the
 * Stream token issuance step also re-checks; this hook exists so a
 * future Proggaa-side ban list has exactly one place to plug into
 * without touching every call site.
 */
async function isBannedFromLiveClass(_liveClassId: string, _userId: string): Promise<boolean> {
  return false;
}
