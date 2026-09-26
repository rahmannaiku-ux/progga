"use server";

import {
  requestRegistration,
  completeRegistration,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth-service";
import { setSessionCookie, clearSessionCookie, getSessionCookieToken } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/**
 * Thin "use server" wrappers around src/server/services/auth-service.ts.
 * This is the ONLY layer that touches the session cookie — the service
 * layer stays framework-agnostic and directly unit-testable.
 *
 * Plain typed-object arguments (not FormData) — matches this codebase's
 * existing convention for actions called directly from interactive
 * client components (e.g. src/server/actions/profile-actions.ts'
 * updateProfile), which is how the Phase 4 UI calls these.
 *
 * Deliberately return plain result objects rather than calling
 * next/navigation's redirect() — see the doc comment on
 * requireActiveUser in src/server/actions/require-user.ts for why
 * (a documented Next.js 14 Server Action + redirect() interaction bug).
 * Client components navigate themselves based on the returned result.
 *
 * SECURITY: the service layer's success results carry the full Prisma
 * User row (including passwordHash) so internal callers/tests can use
 * it — this layer is what's actually exposed to the browser via the
 * Server Action boundary, so it MUST strip every result down to
 * `toSafeUser` before returning. Never spread/return `result.user` or
 * `result.rawToken`/`result.session` directly.
 */

function toSafeUser(user: User) {
  return { id: user.id, role: user.role, profileCompleted: user.profileCompleted };
}

export async function requestRegistrationOtpAction(input: { phone: string }) {
  return requestRegistration(input.phone);
}

export async function completeRegistrationAction(input: { phone: string; otp: string; password: string }) {
  const result = await completeRegistration(input.phone, input.otp, input.password);
  if (result.ok) {
    setSessionCookie(result.rawToken, result.session.expiresAt);
    return { ok: true as const, user: toSafeUser(result.user) };
  }
  return result;
}

export async function loginAction(input: { phone: string; password: string; confirmTakeover?: boolean }) {
  const result = await login(input.phone, input.password, { confirmTakeover: input.confirmTakeover ?? false });
  if (result.ok) {
    setSessionCookie(result.rawToken, result.session.expiresAt);
    return { ok: true as const, user: toSafeUser(result.user) };
  }
  return result;
}

export async function logoutAction() {
  const token = getSessionCookieToken();
  if (token) await logout(token);
  clearSessionCookie();
  return { ok: true as const };
}

export async function requestPasswordResetAction(input: { phone: string }) {
  return requestPasswordReset(input.phone);
}

export async function resetPasswordAction(input: { phone: string; otp: string; newPassword: string }) {
  return resetPassword(input.phone, input.otp, input.newPassword);
}
