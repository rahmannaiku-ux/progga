/**
 * Single source of truth for Bangladeshi phone number normalization.
 * Every auth code path (registration, login, OTP send/verify, password
 * reset, duplicate detection, session/account lookup) MUST call
 * `normalizeBangladeshPhone` before using a phone number for lookup,
 * storage, or comparison — never re-implement parsing/stripping logic
 * elsewhere.
 *
 * Canonical form: "+8801XXXXXXXXX" (E.164-style, no spaces/dashes).
 *
 * Recognized operator prefixes: 013, 014, 015, 016, 017, 018, 019
 * (the 10 digits following "01" cover the current Bangladeshi mobile
 * numbering plan — 01[3-9]XXXXXXXX, 11 digits total starting with 0).
 */

const BD_LOCAL_PATTERN = /^01[3-9]\d{8}$/; // e.g. 017XXXXXXXX — 11 digits
const BD_COUNTRY_CODE = "88";

/**
 * Normalizes a Bangladeshi phone number to canonical "+8801XXXXXXXXX"
 * form. Accepts (whitespace/dashes/parens stripped first):
 *   - 017XXXXXXXX        (local, 11 digits)
 *   - 8801XXXXXXXX       (country code, no plus, 13 digits)
 *   - +8801XXXXXXXX      (E.164)
 *   - 008801XXXXXXXX     (international dial prefix)
 *
 * Returns null for anything that doesn't resolve to a valid 11-digit
 * Bangladeshi mobile number after stripping prefixes — callers must
 * treat null as "invalid", not attempt further guessing.
 */
export function normalizeBangladeshPhone(input: string): string | null {
  if (typeof input !== "string") return null;

  // Strip everything except digits and a leading "+", so "+880 17-123
  // 45678", "(017) 123-45678", etc. all collapse to the same digit run.
  let s = input.trim().replace(/[^\d+]/g, "");

  // Normalize international dial prefix "00" -> "+".
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+")) s = s.slice(1);

  // Strip a leading country code if present.
  if (s.startsWith(BD_COUNTRY_CODE) && s.length === 13) {
    s = s.slice(BD_COUNTRY_CODE.length); // -> 01XXXXXXXXX (11 digits)
  }

  if (!BD_LOCAL_PATTERN.test(s)) return null;

  return `+${BD_COUNTRY_CODE}${s}`;
}

/** True if `input` normalizes to a valid Bangladeshi mobile number. */
export function isValidBangladeshPhone(input: string): boolean {
  return normalizeBangladeshPhone(input) !== null;
}

/**
 * Masks a canonical phone number for display/logging/watermarking, e.g.
 * "+8801712345678" -> "+8801*****678". Never log or display a full raw
 * phone number in contexts meant for anything other than the account
 * owner (OTP delivery target, etc).
 */
export function maskPhone(canonicalPhone: string): string {
  if (canonicalPhone.length < 8) return "****";
  return canonicalPhone.slice(0, 6) + "*".repeat(canonicalPhone.length - 9) + canonicalPhone.slice(-3);
}
