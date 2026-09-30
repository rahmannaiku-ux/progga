import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookieToken, validateSessionToken } from "@/lib/auth/session";

/**
 * Identity comes from the custom session cookie
 * (src/lib/auth/session.ts). Dozens of pages and server actions import
 * these helpers by name.
 *
 * There is no lazy user creation: every User row a session can point to
 * was created by completeRegistration
 * (src/server/services/auth-service.ts), which creates studentProfile +
 * heroStats atomically at registration time.
 *
 * Legacy accounts that only have the old `clerkId` (no
 * phone/passwordHash) have no custom session to present and cannot sign
 * in through this path; their data is untouched.
 */
export const getCurrentUser = cache(async () => {
  const token = getSessionCookieToken();
  if (!token) redirect("/login");

  const validated = await validateSessionToken(token);
  if (!validated) redirect("/login");

  const { user } = validated;

  if (!user.isActive || user.isSuspended) {
    redirect("/login?error=account_inactive");
  }

  return user;
});

/**
 * Non-redirecting counterpart to `getCurrentUser`, for optional/public
 * contexts (e.g. the marketing site header) that need to know "is this
 * visitor signed in, and if so what role are they" without forcing an
 * anonymous visitor through sign-in or bouncing a suspended user off a
 * public page just because a nav link tried to resolve their role.
 * Returns `null` for anyone not signed in. Never redirects.
 *
 * Wrapped in `cache()` for the same reason as the other helpers here:
 * the header and any other server component reading it within one
 * request share a single lookup.
 */
export const getCurrentUserRoleOptional = cache(async () => {
  const token = getSessionCookieToken();
  if (!token) return null;

  const validated = await validateSessionToken(token);
  if (!validated) return null;

  const { user } = validated;
  if (!user.isActive || user.isSuspended) return null;

  return user.role;
});

/**
 * Same non-redirecting contract as getCurrentUserRoleOptional above,
 * but returns the fields a public page actually needs to know "is this
 * specific visitor enrolled / do they have an in-flight payment"
 * (e.g. the /courses/[slug] buying page) — id and role — without
 * forcing sign-in just to view a public page. Returns null for anyone
 * not signed in.
 */
export const getCurrentUserOptional = cache(async () => {
  const token = getSessionCookieToken();
  if (!token) return null;

  const validated = await validateSessionToken(token);
  if (!validated) return null;

  const { user } = validated;
  if (!user.isActive || user.isSuspended) return null;

  return { id: user.id, role: user.role, isActive: user.isActive, isSuspended: user.isSuspended };
});
