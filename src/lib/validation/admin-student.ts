import { normalizeBangladeshPhone } from "@/lib/auth/phone";

/**
 * What an admin may change on a student. Every field here is a plain string or
 * boolean straight from the form; this file turns it into clean, ready-to-save
 * values or a field-keyed error map. It is deliberately looser than the
 * student's own form: an admin can blank optional fields and save a profile
 * the student never finished. Formats are still checked, and the login phone
 * can never be emptied.
 */
export type AdminStudentEditInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  headline: string;
  bio: string;
  profileCompleted: boolean;
  isActive: boolean;

  name: string;
  district: string;
  zipCode: string;
  collegeName: string;
  collegeEIIN: string;
  fatherPhone: string;
  motherPhone: string;
  hscBatch: string;
  studyVersion: string;
};

/** Only sent when the admin actually changed them, so a stale form can't overwrite live progress. */
export type AdminStudentStatsInput = {
  xp?: number;
  currentStreak?: number;
  longestStreak?: number;
};

export type AdminStudentEditData = {
  user: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    phoneVerified: boolean;
    headline: string | null;
    bio: string | null;
    profileCompleted: boolean;
    isActive: boolean;
  };
  profile: {
    name: string | null;
    district: string | null;
    zipCode: string | null;
    collegeName: string | null;
    collegeEIIN: string | null;
    fatherPhone: string | null;
    motherPhone: string | null;
    hscBatch: string | null;
    studyVersion: "BANGLA" | "ENGLISH" | null;
  };
};

export type AdminStudentFieldErrors = Partial<Record<keyof AdminStudentEditInput | "xp" | "currentStreak" | "longestStreak", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HSC_BATCH_PATTERN = /^(19|20)\d{2}$/;
export const MAX_ADMIN_XP = 10_000_000;
export const MAX_ADMIN_STREAK = 100_000;

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAdminStudentEdit(
  input: AdminStudentEditInput
): { ok: true; data: AdminStudentEditData } | { ok: false; fieldErrors: AdminStudentFieldErrors } {
  const errors: AdminStudentFieldErrors = {};
  const text = (key: keyof AdminStudentEditInput, label: string, max = 200) => {
    const v = String(input[key] ?? "").trim();
    if (v.length > max) errors[key] = `${label} is too long.`;
    return v;
  };

  const firstName = text("firstName", "First name", 100);
  const lastName = text("lastName", "Last name", 100);
  const headline = text("headline", "Headline");
  const bio = text("bio", "Bio", 2000);
  const name = text("name", "Full name");
  const district = text("district", "District");
  const zipCode = text("zipCode", "ZIP / postal code");
  const collegeName = text("collegeName", "College name");
  const collegeEIIN = text("collegeEIIN", "College EIIN");

  const emailRaw = String(input.email ?? "").trim().toLowerCase();
  if (emailRaw.length > 0 && (emailRaw.length > 200 || !EMAIL_PATTERN.test(emailRaw))) {
    errors.email = "Enter a valid email address.";
  }

  const phone = normalizeBangladeshPhone(String(input.phone ?? "").trim());
  if (!phone) errors.phone = "Enter a valid Bangladeshi phone number. The login phone can't be empty.";

  const parentPhone = (key: "fatherPhone" | "motherPhone") => {
    const raw = String(input[key] ?? "").trim();
    if (raw.length === 0) return null;
    const normalized = normalizeBangladeshPhone(raw);
    if (!normalized) errors[key] = "Enter a valid phone number or leave it empty.";
    return normalized;
  };
  const fatherPhone = parentPhone("fatherPhone");
  const motherPhone = parentPhone("motherPhone");

  const hscBatch = String(input.hscBatch ?? "").trim();
  if (hscBatch.length > 0 && !HSC_BATCH_PATTERN.test(hscBatch)) {
    errors.hscBatch = "Enter a 4-digit year, e.g. 2026, or leave it empty.";
  }

  const sv = String(input.studyVersion ?? "");
  if (sv !== "" && sv !== "BANGLA" && sv !== "ENGLISH") errors.studyVersion = "Choose Bangla, English or none.";

  if (Object.keys(errors).length > 0 || !phone) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    data: {
      user: {
        firstName,
        lastName,
        email: emailRaw.length > 0 ? emailRaw : null,
        phone,
        phoneVerified: Boolean(input.phoneVerified),
        headline: orNull(headline),
        bio: orNull(bio),
        profileCompleted: Boolean(input.profileCompleted),
        isActive: Boolean(input.isActive),
      },
      profile: {
        name: orNull(name),
        district: orNull(district),
        zipCode: orNull(zipCode),
        collegeName: orNull(collegeName),
        collegeEIIN: orNull(collegeEIIN),
        fatherPhone,
        motherPhone,
        hscBatch: orNull(hscBatch),
        studyVersion: sv === "" ? null : (sv as "BANGLA" | "ENGLISH"),
      },
    },
  };
}

export function parseAdminStudentStats(
  stats: AdminStudentStatsInput | undefined
): { ok: true; stats: AdminStudentStatsInput } | { ok: false; fieldErrors: AdminStudentFieldErrors } {
  const errors: AdminStudentFieldErrors = {};
  const out: AdminStudentStatsInput = {};
  const check = (key: "xp" | "currentStreak" | "longestStreak", max: number, label: string) => {
    const v = stats?.[key];
    if (v === undefined) return;
    if (!Number.isInteger(v) || v < 0 || v > max) errors[key] = `${label} must be a whole number from 0 to ${max.toLocaleString("en-US")}.`;
    else out[key] = v;
  };
  check("xp", MAX_ADMIN_XP, "XP");
  check("currentStreak", MAX_ADMIN_STREAK, "Current streak");
  check("longestStreak", MAX_ADMIN_STREAK, "Longest streak");
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, stats: out };
}
