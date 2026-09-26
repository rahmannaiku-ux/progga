import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookieToken, validateSessionToken } from "@/lib/auth/session";

/**
 * PHASE 5: migrated off Clerk. Identity now comes from the custom
 * session cookie (src/lib/auth/session.ts) rather than Clerk's auth().
 * Every exported name/signature here is unchanged on purpose — dozens
 * of call sites across (hero)/(mentor)/(admin) pages and server actions
 * import these by name, and none of them needed to change for this
 * migration.
 *
 * The old Clerk-era lazy-create-on-first-visit logic (create a User row
 * the first time someone with a valid Clerk session but no DB row yet
 * hits a protected page) is gone: there is no external identity
 * provider anymore whose session can exist before a User row does.
 * Every User row a session can ever point to was created by
 * completeRegistration (src/server/services/auth-service.ts), which
 * already creates studentProfile + heroStats atomically at
 * registration time — nothing left to lazily backfill here.
 *
 * Existing Clerk-only accounts (no phone/passwordHash, only a legacy
 * clerkId) have no custom session to present, so they simply cannot
 * authenticate through this path anymore. That is the accepted,
 * explicitly-instructed outcome ("existing Clerk users do NOT need to
 * be migrated") — their data is untouched, but their login story is a
 * deliberately open product decision, flagged repeatedly across the
 * Phase 5 staging/execution reports, not something this migration
 * resolves unilaterally.
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
