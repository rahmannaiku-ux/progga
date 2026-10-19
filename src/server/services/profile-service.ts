import { db } from "@/lib/db/client";
import { normalizeBangladeshPhone } from "@/lib/auth/phone";
import { Prisma, type StudyVersion } from "@prisma/client";
import { calendarDateToDb, parseDateOfBirth } from "@/lib/birthday/dates";
import { ensureUsername } from "@/server/services/usernames";

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
  /** Required login/contact email, saved on the User row (not the profile). */
  email: string;
  district: string;
  zipCode: string;
  collegeName: string;
  collegeEIIN?: string;
  fatherPhone?: string;
  motherPhone?: string;
  hscBatch: string;
  studyVersion: string;
  /** "YYYY-MM-DD". Private: birthday greetings and rewards only. */
  dateOfBirth: string;
};

export type CompleteStudentProfileResult =
  | { ok: true }
  | { ok: false; reason: "validation"; fieldErrors: Partial<Record<keyof CompleteStudentProfileInput, string>> }
  | { ok: false; reason: "not_found" };

const MAX_TEXT_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HSC_BATCH_PATTERN = /^(19|20)\d{2}$/; // a 4-digit year, e.g. "2024"

function requiredText(value: string | undefined, label: string): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return `${label} is required.`;
  if (trimmed.length > MAX_TEXT_LENGTH) return `${label} is too long.`;
  return null;
}

/**
 * The profile fields a student may edit after first login — everything
 * captured at completion except the parent phones, which are fixed once
 * set (shown on /profile, never editable there).
 */
export type EditableStudentProfileInput = Omit<
  CompleteStudentProfileInput,
  "email" | "fatherPhone" | "motherPhone" | "dateOfBirth"
>;

type EditableStudentProfileData = {
  name: string;
  district: string;
  zipCode: string;
  collegeName: string;
  collegeEIIN: string | null;
  hscBatch: string;
  studyVersion: StudyVersion;
};

type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Validates and normalizes the editable fields. Server-side and
 * authoritative — the client's own validation is a UX convenience only,
 * never trusted here.
 */
function validateEditable(input: EditableStudentProfileInput): {
  data: EditableStudentProfileData;
  fieldErrors: FieldErrors<EditableStudentProfileInput>;
} {
  const fieldErrors: FieldErrors<EditableStudentProfileInput> = {};

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

  return {
    fieldErrors,
    data: {
      name: (input.name ?? "").trim(),
      district: (input.district ?? "").trim(),
      zipCode: (input.zipCode ?? "").trim(),
      collegeName: (input.collegeName ?? "").trim(),
      collegeEIIN: collegeEIIN.length > 0 ? collegeEIIN : null,
      hscBatch,
      studyVersion: input.studyVersion as StudyVersion,
    },
  };
}

/**
 * Validates and normalizes the full profile-completion input: the
 * editable fields plus the parent phones. Returns either the
 * normalized, ready-to-persist data or a field-keyed error map.
 */
function validate(input: CompleteStudentProfileInput, now: Date):
  | {
      ok: true;
      email: string;
      dateOfBirth: Date;
      data: EditableStudentProfileData & { fatherPhone: string | null; motherPhone: string | null };
    }
  | { ok: false; fieldErrors: FieldErrors<CompleteStudentProfileInput> } {
  const editable = validateEditable(input);
  const fieldErrors: FieldErrors<CompleteStudentProfileInput> = { ...editable.fieldErrors };

  const email = (input.email ?? "").trim().toLowerCase();
  if (email.length === 0) fieldErrors.email = "Email is required.";
  else if (email.length > MAX_TEXT_LENGTH || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

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

  const dob = parseDateOfBirth(input.dateOfBirth, now);
  if (!dob.ok) fieldErrors.dateOfBirth = dob.error;

  if (Object.keys(fieldErrors).length > 0 || !dob.ok) return { ok: false, fieldErrors };

  return { ok: true, email, dateOfBirth: calendarDateToDb(dob.date), data: { ...editable.data, fatherPhone, motherPhone } };
}

function emailInUse(): CompleteStudentProfileResult {
  return {
    ok: false,
    reason: "validation",
    fieldErrors: { email: "That email is already used by another account." },
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
export async function completeStudentProfile(
  userId: string,
  input: CompleteStudentProfileInput,
  now: Date = new Date()
): Promise<CompleteStudentProfileResult> {
  const validated = validate(input, now);
  if (!validated.ok) return { ok: false, reason: "validation", fieldErrors: validated.fieldErrors };

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, reason: "not_found" };

  const emailTaken = await db.user.findFirst({
    where: { email: validated.email, NOT: { id: userId } },
    select: { id: true },
  });
  if (emailTaken) return emailInUse();

  try {
    await db.$transaction([
    db.studentProfile.upsert({
      where: { userId },
      create: { userId, ...validated.data, dateOfBirth: validated.dateOfBirth, dateOfBirthSetAt: now },
      update: { ...validated.data },
    }),
    // Only fills a missing date of birth; one already on file (e.g. set by
    // an admin) is never overwritten by re-submitting this form.
    db.studentProfile.updateMany({
      where: { userId, dateOfBirth: null },
      data: { dateOfBirth: validated.dateOfBirth, dateOfBirthSetAt: now },
    }),
    db.user.update({
      where: { id: userId },
      // The name shown everywhere (Community, leaderboards, mentors' lists) comes from these.
      data: { profileCompleted: true, email: validated.email, ...splitName(validated.data.name) },
    }),
  ]);
  } catch (err) {
    // Lost a race with another account claiming the same email.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return emailInUse();
    throw err;
  }
  // Their unique Community @username, now that their name is known (they can change it later).
  await ensureUsername({ id: userId }).catch((err) => console.error("Could not assign a username:", err));

  return { ok: true };
}

export type AddStudentEmailResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "in_use" | "already_set" | "not_found"; message: string };

/**
 * One-time email for a student who finished their profile before email was
 * required. Only works while the account has no email; once saved it can't be
 * changed from here, the same rule as the parent phones.
 */
export async function addStudentEmail(userId: string, rawEmail: string): Promise<AddStudentEmailResult> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (email.length === 0) return { ok: false, reason: "invalid", message: "Email is required." };
  if (email.length > MAX_TEXT_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: "invalid", message: "Enter a valid email address." };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return { ok: false, reason: "not_found", message: "We couldn't find your account." };
  if (user.email) {
    return { ok: false, reason: "already_set", message: "Your email is already saved and can't be changed here." };
  }

  const taken = await db.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
  if (taken) return { ok: false, reason: "in_use", message: "That email is already used by another account." };

  try {
    // Guarded on `email: null` so two quick submissions can't overwrite each other.
    const res = await db.user.updateMany({ where: { id: userId, email: null }, data: { email } });
    if (res.count === 0) {
      return { ok: false, reason: "already_set", message: "Your email is already saved and can't be changed here." };
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "in_use", message: "That email is already used by another account." };
    }
    throw err;
  }
  return { ok: true };
}

export type SetDateOfBirthResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "already_set" | "not_found"; message: string };

/**
 * Adds the date of birth for a student who doesn't have one yet (students
 * who completed their profile before it was asked for). Set-once from the
 * student's side, guarded on `dateOfBirth: null` so two tabs can't race:
 * a date already on file can only be corrected by an admin, so nobody can
 * move their birthday around to collect extra rewards.
 */
export async function setStudentDateOfBirth(userId: string, raw: string, now: Date = new Date()): Promise<SetDateOfBirthResult> {
  const parsed = parseDateOfBirth(raw, now);
  if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.error };

  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { dateOfBirth: true } });
  if (!profile) return { ok: false, reason: "not_found", message: "We couldn't find your profile." };

  const res = await db.studentProfile.updateMany({
    where: { userId, dateOfBirth: null },
    data: { dateOfBirth: calendarDateToDb(parsed.date), dateOfBirthSetAt: now },
  });
  if (res.count === 0) {
    return { ok: false, reason: "already_set", message: "Your date of birth is already saved. Contact support to correct it." };
  }
  return { ok: true };
}

export type UpdateStudentProfileResult =
  | { ok: true }
  | { ok: false; reason: "validation"; fieldErrors: FieldErrors<EditableStudentProfileInput> }
  | { ok: false; reason: "not_found" };

/**
 * Post-completion edit from /profile. Takes only the editable fields —
 * the input type has no parent-phone keys and nothing but
 * `validateEditable`'s output is written, so a crafted request can't
 * change fatherPhone/motherPhone (or the login phone, which has its own
 * OTP-gated flow in auth-service's confirmPhoneChange).
 */
export async function updateStudentProfile(userId: string, input: EditableStudentProfileInput): Promise<UpdateStudentProfileResult> {
  const { data, fieldErrors } = validateEditable(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, reason: "validation", fieldErrors };

  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, reason: "not_found" };

  await db.$transaction([
    db.studentProfile.update({ where: { userId }, data }),
    // Keep the displayed name (User.firstName/lastName) the same as the profile name.
    ...(data.name ? [db.user.update({ where: { id: userId }, data: splitName(data.name) })] : []),
  ]);
  return { ok: true };
}

/** "Mahamuda Rahman Dina" -> first "Mahamuda", last "Rahman Dina": how the profile name becomes the display name. */
export function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/** The public "about me" fields on /profile. Shared by the profile page and the Telegram bot. */
export async function updateHeadlineAndBio(userId: string, input: { headline?: string; bio?: string }) {
  await db.user.update({
    where: { id: userId },
    data: {
      ...(input.headline !== undefined ? { headline: input.headline.trim().slice(0, 150) || null } : {}),
      ...(input.bio !== undefined ? { bio: input.bio.trim().slice(0, 2000) || null } : {}),
    },
  });
}
