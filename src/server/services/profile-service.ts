import { db } from "@/lib/db/client";
import { normalizeBangladeshPhone } from "@/lib/auth/phone";
import type { StudyVersion } from "@prisma/client";

/**
 * Phase 4 profile-completion service. Deliberately takes `userId` as a
 * plain argument rather than reading the session itself — the caller
 * (src/server/actions/student-profile-actions.ts) is responsible for
 * obtaining it from `requireAuth()` (the Phase 3 server-side session),
 * NEVER from anything client-supplied. Keeping that boundary explicit
 * here means this function can't accidentally be called with a
 * client-controlled userId by some future caller.
 */

export type CompleteStudentProfileInput = {
  name: string;
  district: string;
  zipCode: string;
  collegeName: string;
  collegeEIIN?: string;
  fatherPhone?: string;
  motherPhone?: string;
  hscBatch: string;
  studyVersion: string;
};

export type CompleteStudentProfileResult =
  | { ok: true }
  | { ok: false; reason: "validation"; fieldErrors: Partial<Record<keyof CompleteStudentProfileInput, string>> }
  | { ok: false; reason: "not_found" };

const MAX_TEXT_LENGTH = 200;
const HSC_BATCH_PATTERN = /^(19|20)\d{2}$/; // a 4-digit year, e.g. "2024"

function requiredText(value: string | undefined, label: string): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return `${label} is required.`;
  if (trimmed.length > MAX_TEXT_LENGTH) return `${label} is too long.`;
  return null;
}

/**
 * Validates and normalizes the profile-completion input. Server-side
 * and authoritative — the client's own validation (Part 11) is a UX
 * convenience only, never trusted here. Returns either the
 * normalized, ready-to-persist data or a field-keyed error map.
 */
function validate(input: CompleteStudentProfileInput):
  | { ok: true; data: { name: string; district: string; zipCode: string; collegeName: string; collegeEIIN: string | null; fatherPhone: string | null; motherPhone: string | null; hscBatch: string; studyVersion: StudyVersion } }
  | { ok: false; fieldErrors: Partial<Record<keyof CompleteStudentProfileInput, string>> } {
  const fieldErrors: Partial<Record<keyof CompleteStudentProfileInput, string>> = {};

  const nameErr = requiredText(input.name, "Name");
  if (nameErr) fieldErrors.name = nameErr;

  const districtErr = requiredText(input.district, "District");
  if (districtErr) fieldErrors.district = districtErr;

  const zipErr = requiredText(input.zipCode, "ZIP/postal code");
  if (zipErr) fieldErrors.zipCode = zipErr;

  const collegeErr = requiredText(input.collegeName, "College name");
  if (collegeErr) fieldErrors.collegeName = collegeErr;

  const hscBatch = (input.hscBatch ?? "").trim();
  if (!HSC_BATCH_PATTERN.test(hscBatch)) {
    fieldErrors.hscBatch = "Enter a valid HSC batch year, e.g. 2024.";
  }

  if (input.studyVersion !== "BANGLA" && input.studyVersion !== "ENGLISH") {
    fieldErrors.studyVersion = "Select a study version.";
  }

  const collegeEIIN = (input.collegeEIIN ?? "").trim();
  if (collegeEIIN.length > MAX_TEXT_LENGTH) fieldErrors.collegeEIIN = "College EIIN is too long.";

  // Parent phones: each, if provided, must be a valid Bangladeshi
  // number (through the one shared normalization utility — never
  // re-implemented here). At least one of the two is required.
  const fatherRaw = (input.fatherPhone ?? "").trim();
  const motherRaw = (input.motherPhone ?? "").trim();

  let fatherPhone: string | null = null;
  if (fatherRaw.length > 0) {
    fatherPhone = normalizeBangladeshPhone(fatherRaw);
    if (!fatherPhone) fieldErrors.fatherPhone = "Enter a valid phone number.";
  }

  let motherPhone: string | null = null;
  if (motherRaw.length > 0) {
    motherPhone = normalizeBangladeshPhone(motherRaw);
    if (!motherPhone) fieldErrors.motherPhone = "Enter a valid phone number.";
  }

  if (!fieldErrors.fatherPhone && !fieldErrors.motherPhone && !fatherPhone && !motherPhone) {
    const message = "Provide at least one parent's phone number.";
    fieldErrors.fatherPhone = message;
    fieldErrors.motherPhone = message;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      name: input.name.trim(),
      district: input.district.trim(),
      zipCode: input.zipCode.trim(),
      collegeName: input.collegeName.trim(),
      collegeEIIN: collegeEIIN.length > 0 ? collegeEIIN : null,
      fatherPhone,
      motherPhone,
      hscBatch,
      studyVersion: input.studyVersion as StudyVersion,
    },
  };
}

/**
 * Persists the mandatory first-login profile for `userId` and, only on
 * successful persistence, sets `User.profileCompleted = true`. Both
 * writes happen in one transaction — a validation failure never
 * reaches the database at all, and a database failure never leaves
 * `profileCompleted` set without the profile actually having saved.
 *
 * Safe to call more than once (e.g. a duplicate/concurrent submission,
 * or a student revisiting the page): `upsert` means a second
 * successful call just overwrites the same row with the same-shaped
 * data rather than erroring on an already-existing StudentProfile.
 */
export async function completeStudentProfile(userId: string, input: CompleteStudentProfileInput): Promise<CompleteStudentProfileResult> {
  const validated = validate(input);
  if (!validated.ok) return { ok: false, reason: "validation", fieldErrors: validated.fieldErrors };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, reason: "not_found" };

  await db.$transaction([
    db.studentProfile.upsert({
      where: { userId },
      create: { userId, ...validated.data },
      update: { ...validated.data },
    }),
    db.user.update({ where: { id: userId }, data: { profileCompleted: true } }),
  ]);

  return { ok: true };
}
