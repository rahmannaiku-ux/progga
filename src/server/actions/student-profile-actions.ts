"use server";

import { requireAuth } from "@/lib/auth/require-auth";
import { completeStudentProfile, type CompleteStudentProfileInput } from "@/server/services/profile-service";

/**
 * The authenticated user comes ONLY from `requireAuth()` (the Phase 3
 * server-side session cookie) — `input` never carries a userId, so
 * there is no field here a client could tamper with to modify another
 * student's profile. `requireAuth()` throws if there's no valid
 * session, which this deliberately lets propagate (matches the
 * existing convention in src/server/actions/require-user.ts) rather
 * than swallowing it into a generic `{ ok: false }`, so an expired
 * session surfaces as a real error the client's catch block handles by
 * sending the user back to /login.
 */
export async function completeStudentProfileAction(input: CompleteStudentProfileInput) {
  const user = await requireAuth();
  return completeStudentProfile(user.id, input);
}
