"use server";

import { requireAuthPendingTwoStep } from "@/lib/auth/require-auth";
import { findUserByIdentifier } from "@/lib/auth/find-user-by-identifier";
import { requireAdminUser, requireSuperAdminUser } from "./require-user";
import { beginSetup, finishSetup, replaceRecoveryCodes, resetTwoStep, verifyCode } from "@/server/services/two-step";

/**
 * Two-step sign-in for admins (/security/two-step). The first three run BEFORE the check is
 * passed, so they use requireAuthPendingTwoStep; nothing else in the app does.
 * Errors are returned, not thrown, so the person sees them (CLAUDE.md).
 */

export async function beginTwoStepSetupAction() {
  return beginSetup(await requireAuthPendingTwoStep());
}

export async function finishTwoStepSetupAction(code: string) {
  return finishSetup(await requireAuthPendingTwoStep(), String(code ?? ""));
}

export async function verifyTwoStepAction(code: string) {
  return verifyCode(await requireAuthPendingTwoStep(), String(code ?? ""));
}

/** New recovery codes: needs a session that already passed two-step. */
export async function replaceRecoveryCodesAction() {
  const admin = await requireAdminUser();
  return replaceRecoveryCodes(admin.id);
}

/** Super admin: clear another admin's authenticator (lost phone). */
export async function resetTwoStepAction(identifier: string) {
  const admin = await requireSuperAdminUser();
  try {
    const target = await findUserByIdentifier(String(identifier ?? ""));
    return resetTwoStep(admin, target.id);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "No such user." };
  }
}
