"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireActiveUser } from "./require-user";
import { assertLiveRoomEnabled } from "@/lib/live/flag";
import { assertCanManageLiveClass } from "@/server/live/live-access";
import { ensureLiveClass } from "@/server/live/ensure-live-class";
import { getLiveChatService, STREAM_LIVECLASS_CHANNEL_CONFIG } from "@/server/live/chat/service";
import { planTransition, type LiveSchedule } from "@/lib/live/state";
import type { LiveClass } from "@prisma/client";

/**
 * Teacher/admin Live Room actions: lifecycle (start/end/cancel),
 * moderation (pin/unpin/delete/announce/timeout/ban), and chat
 * enable/disable. Every action re-derives the caller from the session
 * (requireActiveUser) and re-checks ownership (assertCanManageLiveClass)
 * -- never trusts a role/id the client claims. All gated behind the
 * live_room flag so none of this is reachable while it's off.
 *
 * Lifecycle actions apply lib/live/state.ts's `planTransition` and write
 * with `updateMany({ where: { id, state: expectedState } })` so a double
 * click or two teachers acting at once can't corrupt the state (see that
 * module's header for the race-safety argument).
 */

async function loadScheduleAndManage(liveClassId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);

  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) {
    throw new Error(access.reason === "NOT_FOUND" ? "Live class not found." : "You don't have access to this live class.");
  }

  const lesson = await db.lesson.findUnique({
    where: { id: access.liveClass.lessonId },
    select: { scheduledStart: true, scheduledEnd: true },
  });
  if (!lesson?.scheduledStart) throw new Error("This live class has no schedule.");

  const schedule: LiveSchedule = { scheduledStart: lesson.scheduledStart, scheduledEnd: lesson.scheduledEnd };
  return { user, liveClass: access.liveClass, schedule };
}

async function applyPlan(liveClass: LiveClass, schedule: LiveSchedule, action: "START" | "END" | "CANCEL", userId: string) {
  const plan = planTransition(action, schedule, liveClass, new Date());
  if (plan.kind === "reject") throw new Error(plan.message);
  if (plan.kind === "noop") return liveClass;

  const extra =
    plan.patch.state === "LIVE"
      ? { startedById: userId }
      : plan.patch.state === "ENDED"
        ? { endedById: userId }
        : {};

  const result = await db.liveClass.updateMany({
    where: { id: liveClass.id, state: plan.expectedState },
    data: { ...plan.patch, ...extra },
  });
  if (result.count === 0) {
    throw new Error("This live class was just updated elsewhere — please refresh and try again.");
  }
  return db.liveClass.findUniqueOrThrow({ where: { id: liveClass.id } });
}

export async function startLiveClass(liveClassId: string) {
  const { user, liveClass, schedule } = await loadScheduleAndManage(liveClassId);
  const updated = await applyPlan(liveClass, schedule, "START", user.id);
  if (updated.state === "LIVE") {
    await getLiveChatService().ensureRoom(liveClassId);
  }
  revalidatePath(`/live/manage/${liveClassId}`);
  revalidatePath("/live/manage");
  return { state: updated.state };
}

/**
 * Ends the class: stamps actualEnd, closes open attendance sessions,
 * snapshots the teacher-authored announcement + pinned message texts
 * (never student chat -- see the schema comment on LiveClass.endSnapshot),
 * then freezes/marks the Stream channel ended. DB state is updated
 * FIRST and is authoritative regardless of whether the Stream call
 * below succeeds -- a Stream hiccup must not leave a class stuck LIVE.
 */
export async function endLiveClass(liveClassId: string) {
  const { user, liveClass, schedule } = await loadScheduleAndManage(liveClassId);
  const updated = await applyPlan(liveClass, schedule, "END", user.id);

  if (updated.state === "ENDED") {
    await db.liveClassAttendance.updateMany({
      where: { liveClassId, leftAt: null },
      data: { leftAt: updated.actualEnd ?? new Date() },
    });

    try {
      await getLiveChatService().closeRoom(liveClassId);
    } catch (err) {
      // Non-fatal: the class is authoritatively ENDED in Proggaa's DB
      // regardless of whether Stream could be reached right now. A
      // stuck-open Stream channel is cleaned up by the sweep (step 13).
      console.error("Failed to close Stream room after ending live class", liveClassId, err);
    }
  }

  revalidatePath(`/live/manage/${liveClassId}`);
  revalidatePath("/live/manage");
  revalidatePath(`/live/${liveClassId}`);
  return { state: updated.state };
}

export async function cancelLiveClass(liveClassId: string) {
  const { user, liveClass, schedule } = await loadScheduleAndManage(liveClassId);
  const updated = await applyPlan(liveClass, schedule, "CANCEL", user.id);

  if (updated.state === "CANCELLED") {
    // Removes it from reminders/calendar/student published lists in one
    // move, with no other legacy code needing to change -- see the
    // architecture plan's decision on this. A LIVE class can never reach
    // here (planTransition rejects CANCEL on a live class), so this
    // never unpublishes a lesson mid-class.
    await db.lesson.update({ where: { id: liveClass.lessonId }, data: { isPublished: false } });
  }

  revalidatePath(`/live/manage/${liveClassId}`);
  revalidatePath("/live/manage");
  return { state: updated.state };
}

export async function setChatEnabled(liveClassId: string, enabled: boolean) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");

  // Stream first, then DB (per the architecture plan's ordering for
  // moderation state) -- if the Stream call fails, we don't want the DB
  // to claim chat is enabled while the channel is still frozen.
  await getLiveChatService().freezeRoom(liveClassId, !enabled);
  await db.liveClass.update({ where: { id: liveClassId }, data: { chatEnabled: enabled } });

  revalidatePath(`/live/manage/${liveClassId}`);
  revalidatePath(`/live/${liveClassId}`);
}

export async function setLiveClassAnnouncement(liveClassId: string, text: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");

  const trimmed = text.trim();
  if (trimmed.length > STREAM_LIVECLASS_CHANNEL_CONFIG.maxMessageLength) {
    throw new Error(`Announcement is too long (max ${STREAM_LIVECLASS_CHANNEL_CONFIG.maxMessageLength} characters).`);
  }

  await getLiveChatService().setAnnouncement(liveClassId, trimmed || null);
  revalidatePath(`/live/${liveClassId}`);
}

export async function removeLiveClassAnnouncement(liveClassId: string) {
  return setLiveClassAnnouncement(liveClassId, "");
}

export async function pinLiveClassMessage(liveClassId: string, messageId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");
  // The MAX_PINNED_MESSAGES cap (3) is enforced by the room UI (it
  // disables the Pin action once 3 are pinned, reading the channel's own
  // pinned-message list) rather than here, since this action has no way
  // to see current pin count without also depending on the chat
  // provider's read path -- see STREAM_LIVECLASS_CHANNEL_CONFIG.
  await getLiveChatService().pinMessage(liveClassId, messageId);
  revalidatePath(`/live/${liveClassId}`);
}

export async function unpinLiveClassMessage(liveClassId: string, messageId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");
  await getLiveChatService().unpinMessage(liveClassId, messageId);
  revalidatePath(`/live/${liveClassId}`);
}

export async function deleteLiveClassMessage(liveClassId: string, messageId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");
  await getLiveChatService().deleteMessage(messageId);
  revalidatePath(`/live/${liveClassId}`);
}

export async function timeoutLiveClassUser(liveClassId: string, targetUserId: string, minutes: number) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");
  await getLiveChatService().timeoutUser({ roomId: liveClassId, targetUserId }, minutes);
}

export async function removeLiveClassUser(liveClassId: string, targetUserId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  const access = await assertCanManageLiveClass(liveClassId, user);
  if (!access.ok) throw new Error("You don't have access to this live class.");
  await getLiveChatService().banUser({ roomId: liveClassId, targetUserId });
}

/**
 * Teacher-facing "open the manage page for this lesson" entry point --
 * calls ensureLiveClass so a teacher never has to manually provision a
 * LiveClass row (matches the architecture plan's lazy-creation decision).
 * Ownership of the LESSON's course is checked BEFORE the row is
 * created, via the same assertOwnsCourse rule mission-actions.ts uses
 * (owner/co-teacher/admin) -- so a student (or an unrelated teacher)
 * cannot use this to spray LiveClass rows for lessons they don't teach.
 */
export async function ensureLiveClassForLesson(lessonId: string) {
  const user = await requireActiveUser();
  await assertLiveRoomEnabled(user);
  if (user.role !== "TEACHER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only mentors can manage live classes.");
  }

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  if (!lesson) throw new Error("Lesson not found.");

  const courseId = lesson.group.chapter.module.courseId;
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true, courseTeachers: { where: { teacherId: user.id }, select: { id: true } } },
  });
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const owns = !!course && (course.teacherId === user.id || course.courseTeachers.length > 0);
  if (!isAdmin && !owns) throw new Error("You don't have access to this course.");

  const liveClass = await ensureLiveClass(lessonId);
  return { liveClassId: liveClass.id };
}
