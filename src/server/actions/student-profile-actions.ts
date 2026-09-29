"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  completeStudentProfile,
  updateStudentProfile,
  type CompleteStudentProfileInput,
  type EditableStudentProfileInput,
} from "@/server/services/profile-service";
import { requestPhoneChange, confirmPhoneChange } from "@/server/services/auth-service";

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

/** Edits the post-completion profile fields (never the parent phones). Same userId rule as above. */
export async function updateStudentProfileAction(input: EditableStudentProfileInput) {
  const user = await requireAuth();
  const result = await updateStudentProfile(user.id, {
    name: input.name,
    district: input.district,
    zipCode: input.zipCode,
    collegeName: input.collegeName,
    collegeEIIN: input.collegeEIIN,
    hscBatch: input.hscBatch,
    studyVersion: input.studyVersion,
  });
  if (result.ok) revalidatePath("/profile");
  return result;
}

/** Sends an OTP to the student's prospective new login phone. */
export async function requestPhoneChangeOtpAction(input: { phone: string }) {
  const user = await requireAuth();
  return requestPhoneChange(user.id, input.phone);
}

/** Verifies that OTP and swaps the new number in as the login phone. */
export async function confirmPhoneChangeAction(input: { phone: string; otp: string }) {
  const user = await requireAuth();
  const result = await confirmPhoneChange(user.id, input.phone, input.otp);
  if (result.ok) revalidatePath("/profile");
  return result;
}
