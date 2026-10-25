"use server";

import { requireActiveUser, requireAdminUser } from "./require-user";
import { clearSessionCookie } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { cancelAccountDeletion, requestAccountDeletion } from "@/server/services/account-deletion";
import { revalidatePath } from "next/cache";

/** The student deletes their account (restorable for 30 days by signing in). */
export async function requestAccountDeletionAction(input: { password: string; reason?: string }) {
  const user = await requireActiveUser();
  if (!(await checkRateLimit("strict", `account-delete:${user.id}`)).success) {
    return { ok: false as const, error: "Too many tries. Please wait a minute and try again." };
  }
  const result = await requestAccountDeletion(user.id, String(input.password ?? ""), input.reason ? String(input.reason) : null);
  if (!result.ok) return result;
  await clearSessionCookie();
  return { ok: true as const, scheduledFor: result.scheduledFor };
}

/** An admin stops a scheduled deletion (the student asked them to, or it was a mistake). */
export async function adminCancelAccountDeletionAction(userId: string) {
  const admin = await requireAdminUser();
  const cancelled = await cancelAccountDeletion(String(userId), admin.id);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return cancelled ? { ok: true as const } : { ok: false as const, error: "This account isn't scheduled for deletion." };
}
