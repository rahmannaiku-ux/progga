import { NextResponse } from "next/server";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { studentNeedsProfileStep } from "@/lib/auth/profile-gate";
import type { Role } from "@prisma/client";

/**
 * Shared "who is calling this /api/live/** route" resolver, backed by
 * the custom session via getCurrentActiveSessionUser
 * (src/lib/auth/require-auth.ts).
 */
export type LiveApiUser = { id: string; role: Role };

export type LiveApiAuthResult = { ok: true; user: LiveApiUser } | { ok: false; response: NextResponse };

/**
 * PHASE 6: closes the profile-gate follow-up from Phase 5. All three
 * /api/live/[id]/** routes (attendance, chat-token, state) share this
 * resolver, so the STUDENT-must-have-a-completed-profile rule is
 * enforced exactly once, here — matching the same
 * `role === "STUDENT" && !profileCompleted` gate already used by
 * requireCompletedProfile (src/lib/auth/require-auth.ts) — rather than
 * being duplicated (and possibly drifting) across each route file.
 *
 * Deliberately scoped to STUDENT only: TEACHER/ADMIN/SUPER_ADMIN never
 * go through the student profile-completion flow at all (see
 * src/app/(hero)/layout.tsx and requireCompletedProfile), so gating
 * them here on a field that's meaningless for their role would block
 * legitimate teacher/admin access to their own live rooms for no
 * reason. Their existing authorization (resolveLiveApiUser's identity
 * check + assertCanJoinLiveRoom/assertCanManageLiveClass's
 * owner/co-teacher/admin bypass) is untouched.
 */
export async function resolveLiveApiUser(): Promise<LiveApiAuthResult> {
  const user = await getCurrentActiveSessionUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (studentNeedsProfileStep(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "PROFILE_INCOMPLETE" }, { status: 403 }),
    };
  }

  return { ok: true, user: { id: user.id, role: user.role } };
}
