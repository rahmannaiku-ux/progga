import { db } from "@/lib/db/client";
import { encryptSecret, decryptSecret } from "@/lib/storage/token-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { needsTwoStep, newRecoveryCodes, consumeRecoveryCode } from "@/lib/auth/admin-mfa";
import { newTotpSecret, otpauthUrl, totpStep, verifyTotp } from "@/lib/auth/totp";
import { revokeAllActiveSessionsForUser, type ValidatedSession } from "@/lib/auth/session";
import { notifySuperAdmins } from "@/server/services/super-admin-alerts";
import { logAdminActivity } from "@/server/services/admin-tools";

/**
 * Two-step sign-in for admin accounts (policy: src/lib/auth/admin-mfa.ts). Callers pass the
 * session from requireAuthPendingTwoStep(); everything here re-checks the role itself.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const label = (u: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone || u.email || "An admin";

/** A fresh secret for an admin who has not set up two-step yet (replaces an unfinished one). */
export async function beginSetup(s: ValidatedSession): Promise<Result<{ secret: string; url: string }>> {
  if (!needsTwoStep(s.user.role)) return { ok: false, error: "Two-step sign-in is for admin accounts." };
  if (s.user.mfaEnabledAt) return { ok: false, error: "Two-step sign-in is already set up for this account." };
  const rl = await checkRateLimit("strict", `mfa-setup:${s.user.id}`);
  if (!rl.success) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  const secret = newTotpSecret();
  await db.user.update({ where: { id: s.user.id }, data: { mfaSecretEncrypted: encryptSecret(secret) } });
  return { ok: true, secret, url: otpauthUrl(secret, s.user.phone ?? s.user.email ?? s.user.id) };
}

/** The first code from the app proves it was added: two-step is on, this session is verified. */
export async function finishSetup(s: ValidatedSession, code: string): Promise<Result<{ recoveryCodes: string[] }>> {
  if (!needsTwoStep(s.user.role)) return { ok: false, error: "Two-step sign-in is for admin accounts." };
  const rl = await checkRateLimit("otpVerify", `mfa:${s.user.id}`);
  if (!rl.success) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const user = await db.user.findUnique({ where: { id: s.user.id } });
  if (!user?.mfaSecretEncrypted) return { ok: false, error: "Start the set-up again." };
  if (user.mfaEnabledAt) return { ok: false, error: "Two-step sign-in is already set up for this account." };
  const step = verifyTotp(decryptSecret(user.mfaSecretEncrypted), code, Date.now(), null);
  if (step === null) return { ok: false, error: "That code didn't match. Check the phone's time is automatic and try the newest code." };
  const { codes, hashes } = newRecoveryCodes();
  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { mfaEnabledAt: now, mfaLastUsedStep: step, mfaRecoveryCodeHashes: hashes } }),
    db.session.update({ where: { id: s.session.id }, data: { mfaVerifiedAt: now } }),
  ]);
  await logAdminActivity(user.id, "SETTINGS_CHANGE", "TwoStep", user.id, { event: "enabled" });
  await notifySuperAdmins({ title: "Two-step sign-in turned on", body: `${label(user)} (${user.role}) set up an authenticator app.`, linkUrl: "/admin/users" });
  return { ok: true, recoveryCodes: codes };
}

/** A code from the app, or one recovery code, opens the admin portal for this session. */
export async function verifyCode(s: ValidatedSession, typed: string): Promise<Result<{ recoveryCodesLeft: number }>> {
  if (!needsTwoStep(s.user.role)) return { ok: false, error: "Two-step sign-in is for admin accounts." };
  const rl = await checkRateLimit("otpVerify", `mfa:${s.user.id}`);
  if (!rl.success) {
    await notifySuperAdmins({
      title: "Repeated wrong two-step codes",
      body: `Someone signed in as ${label(s.user)} (${s.user.role}) keeps entering wrong codes. If it isn't them, suspend the account and reset its password.`,
      linkUrl: "/admin/users",
    });
    return { ok: false, error: "Too many wrong codes. Wait 10 minutes and try again." };
  }
  const user = await db.user.findUnique({ where: { id: s.user.id } });
  if (!user?.mfaEnabledAt || !user.mfaSecretEncrypted) return { ok: false, error: "Set up two-step sign-in first." };

  const raw = String(typed ?? "").trim();
  let recoveryLeft = user.mfaRecoveryCodeHashes.length;
  if (/^\d[\d\s]*$/.test(raw)) {
    const step = verifyTotp(decryptSecret(user.mfaSecretEncrypted), raw, Date.now(), user.mfaLastUsedStep);
    if (step === null) return { ok: false, error: "That code didn't match, or it was already used. Wait for the next one." };
    // only the first request with this step wins: the same code can't open two sessions
    const won = await db.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step },
    });
    if (won.count !== 1) return { ok: false, error: "That code was already used. Wait for the next one." };
  } else {
    const left = consumeRecoveryCode(user.mfaRecoveryCodeHashes, raw);
    if (!left) return { ok: false, error: "That recovery code isn't valid or was already used." };
    const won = await db.user.updateMany({
      where: { id: user.id, mfaRecoveryCodeHashes: { equals: user.mfaRecoveryCodeHashes } },
      data: { mfaRecoveryCodeHashes: left },
    });
    if (won.count !== 1) return { ok: false, error: "Try again." };
    recoveryLeft = left.length;
    await notifySuperAdmins({
      title: "A recovery code was used",
      body: `${label(user)} (${user.role}) signed in with a recovery code; ${left.length} left.`,
      linkUrl: "/admin/users",
    });
  }

  const firstTime = !s.session.mfaVerifiedAt;
  await db.session.update({ where: { id: s.session.id }, data: { mfaVerifiedAt: new Date(), lastActivityAt: new Date() } });
  if (firstTime) {
    await logAdminActivity(user.id, "LOGIN", "AdminSession", s.session.id, { device: s.session.deviceLabel ?? null });
    await db.notification.create({
      data: {
        userId: user.id,
        type: "SYSTEM",
        title: "Admin sign-in",
        body: `Your admin account was opened${s.session.deviceLabel ? ` on ${s.session.deviceLabel}` : ""}. If this wasn't you, change your password now.`,
        linkUrl: "/settings",
      },
    });
  }
  return { ok: true, recoveryCodesLeft: recoveryLeft };
}

/** Ten new recovery codes for an admin who is signed in with two-step (the old ones stop working). */
export async function replaceRecoveryCodes(userId: string): Promise<Result<{ recoveryCodes: string[] }>> {
  const { codes, hashes } = newRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { mfaRecoveryCodeHashes: hashes } });
  await logAdminActivity(userId, "SETTINGS_CHANGE", "TwoStep", userId, { event: "recovery_codes_replaced" });
  return { ok: true, recoveryCodes: codes };
}

/** A super admin clears another admin's two-step (lost phone): they set it up again at next sign-in. */
export async function resetTwoStep(actor: { id: string; role: string }, targetId: string): Promise<Result> {
  if (actor.role !== "SUPER_ADMIN") return { ok: false, error: "Only a super admin can reset two-step sign-in." };
  if (actor.id === targetId) return { ok: false, error: "Ask another super admin to reset your own." };
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target || !needsTwoStep(target.role)) return { ok: false, error: "That account is not an admin." };
  await db.user.update({
    where: { id: target.id },
    data: { mfaSecretEncrypted: null, mfaEnabledAt: null, mfaLastUsedStep: null, mfaRecoveryCodeHashes: [] },
  });
  await revokeAllActiveSessionsForUser(target.id);
  await logAdminActivity(actor.id, "SETTINGS_CHANGE", "TwoStep", target.id, { event: "reset_by_super_admin" });
  await notifySuperAdmins({ title: "Two-step sign-in reset", body: `${label(target)}'s authenticator was reset; they were signed out everywhere.`, linkUrl: "/admin/users" });
  return { ok: true };
}

export const currentTotpStep = () => totpStep(Date.now());
