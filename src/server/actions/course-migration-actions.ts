"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "./require-user";
import { requireCompletedProfile } from "@/lib/auth/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { normalizeBangladeshPhone } from "@/lib/auth/phone";
import {
  adminSwitchMission,
  cancelMissionSwitch,
  countSelfSwitches,
  rejectMissionSwitchRequest,
  requestMissionSwitch,
  switchMissionSelf,
  type SwitchResult,
} from "@/server/services/course-migration";

const pairSchema = z.object({ fromCourseId: z.string().min(1).max(64), toCourseId: z.string().min(1).max(64) });

function refresh() {
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath("/admin/mission-switches");
}

/** The student's own switch. */
export async function switchMissionAction(fromCourseId: string, toCourseId: string): Promise<SwitchResult> {
  const user = await requireCompletedProfile();
  const parsed = pairSchema.safeParse({ fromCourseId, toCourseId });
  if (!parsed.success) return { ok: false, error: "Pick a mission to switch to." };
  if (!(await checkRateLimit("strict", `mission-switch:${user.id}`)).success) {
    return { ok: false, error: "Too many tries. Please wait a minute and try again." };
  }
  const result = await switchMissionSelf(user.id, parsed.data.fromCourseId, parsed.data.toCourseId);
  refresh();
  return result;
}

/** Asks an admin for a switch (after the student's own one is used). */
export async function requestMissionSwitchAction(
  fromCourseId: string,
  toCourseId: string,
  reason: string
): Promise<SwitchResult> {
  const user = await requireCompletedProfile();
  const parsed = pairSchema.safeParse({ fromCourseId, toCourseId });
  if (!parsed.success) return { ok: false, error: "Pick a mission to switch to." };
  if (!(await checkRateLimit("strict", `mission-switch-request:${user.id}`)).success) {
    return { ok: false, error: "Too many tries. Please wait a minute and try again." };
  }
  const result = await requestMissionSwitch(user.id, parsed.data.fromCourseId, parsed.data.toCourseId, String(reason ?? ""));
  refresh();
  return result;
}

export async function cancelMissionSwitchAction(migrationId: string) {
  const user = await requireCompletedProfile();
  const result = await cancelMissionSwitch(user.id, String(migrationId));
  refresh();
  return result;
}

const adminSchema = pairSchema.extend({
  userId: z.string().min(1).max(64),
  waiveFee: z.boolean(),
  note: z.string().max(1000).nullable(),
  requestId: z.string().min(1).max(64).optional(),
});

/** An admin switches a student's mission, or approves a student's request. */
export async function adminSwitchMissionAction(input: z.input<typeof adminSchema>): Promise<SwitchResult> {
  const admin = await requireAdminUser();
  const parsed = adminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fill in the student and both missions." };
  const result = await adminSwitchMission({ adminId: admin.id, ...parsed.data });
  refresh();
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return result;
}

export async function rejectMissionSwitchAction(requestId: string, note: string) {
  const admin = await requireAdminUser();
  const result = await rejectMissionSwitchRequest(admin.id, String(requestId), String(note ?? ""));
  refresh();
  return result;
}

export type SwitchLookup =
  | {
      ok: true;
      student: { id: string; name: string; phone: string | null };
      enrollments: { courseId: string; title: string; priceCents: number; isFree: boolean }[];
      selfSwitchesUsed: number;
    }
  | { ok: false; error: string };

/** Finds a student by phone number for the admin "switch a student" form. */
export async function lookupStudentForSwitchAction(query: string): Promise<SwitchLookup> {
  await requireAdminUser();
  const raw = String(query ?? "").trim();
  const phone = normalizeBangladeshPhone(raw);
  const student = await db.user.findFirst({
    where: phone ? { phone } : { OR: [{ id: raw }, { username: raw.replace(/^@/, "").toLowerCase() }] },
    select: { id: true, firstName: true, lastName: true, phone: true, deletedAt: true },
  });
  if (!student || student.deletedAt) return { ok: false, error: "No student with that phone number or username." };
  const [enrollments, selfSwitchesUsed] = await Promise.all([
    db.enrollment.findMany({
      where: { userId: student.id },
      orderBy: { enrolledAt: "desc" },
      select: { course: { select: { id: true, title: true, priceCents: true, isFree: true } } },
    }),
    countSelfSwitches(student.id),
  ]);
  return {
    ok: true,
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim() || "Student", phone: student.phone },
    enrollments: enrollments.map((e) => ({
      courseId: e.course.id,
      title: e.course.title,
      priceCents: e.course.priceCents,
      isFree: e.course.isFree,
    })),
    selfSwitchesUsed,
  };
}
