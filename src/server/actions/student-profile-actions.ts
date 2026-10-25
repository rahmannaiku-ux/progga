"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/require-auth";
import { searchInstitutions } from "@/server/services/institutions";
import {
  completeStudentProfile,
  updateStudentProfile,
  addStudentEmail,
  setStudentDateOfBirth,
  confirmSchoolDetails,
  type ConfirmSchoolInput,
  type CompleteStudentProfileInput,
  type EditableStudentProfileInput,
} from "@/server/services/profile-service";
import {
  requestPhoneChange,
  confirmPhoneChange,
  changePassword,
  signOutEverywhere,
} from "@/server/services/auth-service";
import { clearSessionCookie, getSessionCookieToken, validateSessionToken } from "@/lib/auth/session";

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
  const result = await completeStudentProfile(user.id, input);
  if (result.ok) await refreshSessionCache();
  return result;
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
    collegeNotListed: input.collegeNotListed,
    hscBatch: input.hscBatch,
    studyVersion: input.studyVersion,
  });
  if (result.ok) revalidatePath("/settings");
  return result;
}

/** One-time email for a student who has none yet. Same userId rule as above. */
export async function addStudentEmailAction(input: { email: string }) {
  const user = await requireAuth();
  const result = await addStudentEmail(user.id, input.email);
  if (result.ok) revalidatePath("/settings");
  return result;
}

/**
 * Adds a missing date of birth (students who finished their profile before
 * it was asked for). Set-once; same userId rule as above.
 */
export async function setDateOfBirthAction(input: { dateOfBirth: string }) {
  const user = await requireAuth();
  const result = await setStudentDateOfBirth(user.id, String(input?.dateOfBirth ?? ""));
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }
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
  if (result.ok) revalidatePath("/settings");
  return result;
}

/**
 * Changes the signed-in user's password. The current session is kept;
 * every other session is revoked.
 */
export async function changePasswordAction(input: { currentPassword: string; newPassword: string }) {
  const user = await requireAuth();
  const token = await getSessionCookieToken();
  const current = token ? await validateSessionToken(token) : null;
  return changePassword(user.id, current?.session.id, input.currentPassword, input.newPassword);
}

/** Revokes every session of the signed-in user (this device included) and clears the cookie. */
export async function signOutEverywhereAction() {
  const user = await requireAuth();
  await signOutEverywhere(user.id);
  await clearSessionCookie();
  return { ok: true as const };
}

/** College suggestions for the profile forms (name or EIIN). */
export async function searchInstitutionsAction(query: string) {
  await requireAuth();
  return searchInstitutions(String(query ?? ""));
}

/** The college and district check for students who filled in their profile before the official lists. */
export async function confirmSchoolDetailsAction(input: ConfirmSchoolInput) {
  const user = await requireAuth();
  const result = await confirmSchoolDetails(user.id, input);
  if (result.ok) await refreshSessionCache();
  return result;
}

/** Re-reads this session's user so the profile gate sees the change on the very next page. */
async function refreshSessionCache() {
  const token = await getSessionCookieToken();
  if (token) await validateSessionToken(token, { skipCache: true });
}
