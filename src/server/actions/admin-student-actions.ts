"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { requireAdminUser } from "./require-user";
import { logActivity } from "./admin-actions";
import {
  parseAdminStudentEdit,
  parseAdminStudentStats,
  type AdminStudentEditInput,
  type AdminStudentFieldErrors,
  type AdminStudentStatsInput,
} from "@/lib/validation/admin-student";
import { validatePasswordInput, hashPassword } from "@/lib/auth/password";
import { revokeAllActiveSessionsForUser } from "@/lib/auth/session";
import { levelForXp } from "@/lib/gamification/xp-curve";
import { adjustStudentCoinsCore } from "@/server/services/admin-tools";

/**
 * Admin-only editing of a student's whole profile. Every action re-checks the
 * admin on the server, targets STUDENT accounts only (mentors, admins and super
 * admins have their own screens and privilege rules), and returns a result
 * object rather than throwing so the message reaches the admin in production.
 */

type Result = { ok: true } | { ok: false; message: string; fieldErrors?: AdminStudentFieldErrors };

async function loadStudent(targetId: string) {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phoneVerified: true,
      headline: true,
      bio: true,
      profileCompleted: true,
      isActive: true,
      studentProfile: true,
    },
  });
  if (!target) return { error: "That student no longer exists.", target: null };
  if (target.role !== "STUDENT") return { error: "Only student accounts can be edited here.", target: null };
  return { target, error: null };
}

function changedKeys<T extends Record<string, unknown>>(before: T, after: T): string[] {
  return Object.keys(after).filter((k) => before[k] !== after[k]);
}

export async function adminUpdateStudentAction(
  targetId: string,
  input: AdminStudentEditInput,
  stats?: AdminStudentStatsInput
): Promise<Result> {
  const admin = await requireAdminUser();

  const parsed = parseAdminStudentEdit(input);
  if (!parsed.ok) return { ok: false, message: "Fix the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const parsedStats = parseAdminStudentStats(stats);
  if (!parsedStats.ok) return { ok: false, message: "Fix the highlighted fields.", fieldErrors: parsedStats.fieldErrors };

  const loaded = await loadStudent(targetId);
  if (loaded.error !== null) return { ok: false, message: loaded.error };
  const { target } = loaded;
  const { user: userData, profile: profileData } = parsed.data;

  const [emailTaken, phoneTaken] = await Promise.all([
    userData.email
      ? db.user.findFirst({ where: { email: userData.email, NOT: { id: targetId } }, select: { id: true } })
      : null,
    db.user.findFirst({ where: { phone: userData.phone, NOT: { id: targetId } }, select: { id: true } }),
  ]);
  const fieldErrors: AdminStudentFieldErrors = {};
  if (emailTaken) fieldErrors.email = "That email is already used by another account.";
  if (phoneTaken) fieldErrors.phone = "That phone number is already used by another account.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Fix the highlighted fields.", fieldErrors };

  const s = parsedStats.stats;
  const changedUser = changedKeys(
    {
      firstName: target.firstName,
      lastName: target.lastName,
      email: target.email,
      phone: target.phone,
      phoneVerified: target.phoneVerified,
      headline: target.headline,
      bio: target.bio,
      profileCompleted: target.profileCompleted,
      isActive: target.isActive,
    },
    userData
  );
  const before = target.studentProfile;
  const changedProfile = changedKeys(
    {
      name: before?.name ?? null,
      district: before?.district ?? null,
      zipCode: before?.zipCode ?? null,
      collegeName: before?.collegeName ?? null,
      collegeEIIN: before?.collegeEIIN ?? null,
      fatherPhone: before?.fatherPhone ?? null,
      motherPhone: before?.motherPhone ?? null,
      hscBatch: before?.hscBatch ?? null,
      studyVersion: before?.studyVersion ?? null,
    },
    profileData
  );

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetId }, data: userData });
      await tx.studentProfile.upsert({
        where: { userId: targetId },
        create: { userId: targetId, ...profileData },
        update: profileData,
      });
      if (Object.keys(s).length > 0) {
        const current = await tx.heroStats.findUnique({ where: { userId: targetId } });
        const xp = s.xp ?? current?.xp ?? 0;
        const currentStreak = s.currentStreak ?? current?.currentStreak ?? 0;
        const longestStreak = Math.max(s.longestStreak ?? current?.longestStreak ?? 0, currentStreak);
        const data = { xp, level: levelForXp(xp), currentStreak, longestStreak };
        await tx.heroStats.upsert({ where: { userId: targetId }, create: { userId: targetId, ...data }, update: data });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "That email or phone number is already used by another account." };
    }
    throw err;
  }

  // Field names only: the log must not become a second copy of the student's personal data.
  await logActivity(admin.id, "UPDATE", "StudentProfile", targetId, {
    account: changedUser,
    profile: changedProfile,
    stats: Object.keys(s),
  });

  revalidatePath(`/admin/users/${targetId}`);
  revalidatePath("/admin/heroes");
  revalidatePath("/profile");
  return { ok: true };
}

export async function adminSetStudentPasswordAction(targetId: string, newPassword: string): Promise<Result> {
  const admin = await requireAdminUser();
  const check = validatePasswordInput(newPassword);
  if (!check.ok) return { ok: false, message: check.error };

  const loaded = await loadStudent(targetId);
  if (loaded.error !== null) return { ok: false, message: loaded.error };

  await db.user.update({ where: { id: targetId }, data: { passwordHash: await hashPassword(newPassword) } });
  // Whoever held the old password, or a session opened with it, is signed out.
  await revokeAllActiveSessionsForUser(targetId);
  await logActivity(admin.id, "UPDATE", "User", targetId, { passwordReset: true });
  return { ok: true };
}

export async function adminAdjustStudentCoinsAction(targetId: string, amount: number, reason: string): Promise<Result> {
  const admin = await requireAdminUser();
  const result = await adjustStudentCoinsCore(admin, targetId, amount, reason);
  return result.ok ? { ok: true } : { ok: false, message: result.error };
}

export async function adminRemoveStudentAvatarAction(targetId: string): Promise<Result> {
  const admin = await requireAdminUser();
  const loaded = await loadStudent(targetId);
  if (loaded.error !== null) return { ok: false, message: loaded.error };

  await db.user.update({ where: { id: targetId }, data: { avatarUrl: null } });
  await logActivity(admin.id, "UPDATE", "User", targetId, { avatarRemoved: true });
  revalidatePath(`/admin/users/${targetId}`);
  return { ok: true };
}
