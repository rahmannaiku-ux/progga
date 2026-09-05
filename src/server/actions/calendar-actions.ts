"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireMentorUser, requireAdminUser } from "./require-user";
import { logActivity } from "./admin-actions";

function parseEventDates(startAtRaw: string, endAtRaw: string) {
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error("Invalid start date/time.");
  }

  let endAt: Date | null = null;
  if (endAtRaw) {
    endAt = new Date(endAtRaw);
    if (Number.isNaN(endAt.getTime())) {
      throw new Error("Invalid end date/time.");
    }
    if (endAt <= startAt) {
      throw new Error("End must be after the start.");
    }
  }

  return { startAt, endAt };
}

/** Mentor version — scoped to one of their own missions. */
export async function createMissionCalendarEvent(formData: FormData) {
  const mentor = await requireMentorUser("Mentor access required.");
  const courseId = String(formData.get("courseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const endAtRaw = String(formData.get("endAt") ?? "");
  if (!courseId || !title || !startAtRaw) {
    throw new Error("Mission, title, and start date/time are all required.");
  }

  const course = await db.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  if (!course || (course.teacherId !== mentor.id && mentor.role === "TEACHER")) {
    throw new Error("You can only add events to your own missions.");
  }

  const { startAt, endAt } = parseEventDates(startAtRaw, endAtRaw);

  await db.calendarEvent.create({
    data: {
      courseId,
      title,
      description: description || null,
      startAt,
      endAt,
      isGlobal: false,
      createdById: mentor.id,
    },
  });

  revalidatePath("/mentor/calendar");
  revalidatePath("/calendar");
}

/** Admin version — platform-wide (no courseId selected) or targeted at a specific mission. */
export async function createCalendarEvent(formData: FormData) {
  const admin = await requireAdminUser();
  const courseId = String(formData.get("courseId") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const endAtRaw = String(formData.get("endAt") ?? "");
  if (!title || !startAtRaw) {
    throw new Error("Title and start date/time are required.");
  }

  const { startAt, endAt } = parseEventDates(startAtRaw, endAtRaw);

  const event = await db.calendarEvent.create({
    data: {
      courseId,
      title,
      description: description || null,
      startAt,
      endAt,
      isGlobal: !courseId,
      createdById: admin.id,
    },
  });

  await logActivity(admin.id, "CREATE", "CalendarEvent", event.id);
  revalidatePath("/admin/calendar");
  revalidatePath("/calendar");
}

export async function deleteCalendarEvent(eventId: string) {
  const user = await requireMentorUser("Mentor or admin access required.");

  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, course: { select: { teacherId: true } } },
  });
  if (!event) return;

  // A plain TEACHER can only delete events on their own missions — a
  // global event (no course, so `event.course` is null) always fails
  // this for a TEACHER, same as it should. ADMIN/SUPER_ADMIN skip the
  // check entirely, same pattern as deleteMentorAnnouncement.
  if (user.role === "TEACHER" && event.course?.teacherId !== user.id) {
    throw new Error("You can only delete events from your own missions.");
  }

  await db.calendarEvent.delete({ where: { id: eventId } });

  if (user.role !== "TEACHER") {
    await logActivity(user.id, "DELETE", "CalendarEvent", eventId);
  }

  revalidatePath("/mentor/calendar");
  revalidatePath("/admin/calendar");
  revalidatePath("/calendar");
}
