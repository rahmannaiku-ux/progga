/** Largest amount accepted: 5,000,000 taka in poisha — comfortably inside a 32-bit Postgres INTEGER. */
export const MAX_AMOUNT_MINOR = 500_000_000;

/**
 * Parses an SMS/user amount such as "1,250.50" or "500" into exact integer
 * minor units WITHOUT floating point. Returns null for anything ambiguous
 * (negative, >2 decimals, letters, empty, zero, or out of range).
 */
export function parseAmountToMinor(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0") || "0");
  const minor = whole * 100 + frac;
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}

/** Normalizes a Bangladeshi mobile number ("+8801712345678", "8801712345678", "01712-345678") to 01XXXXXXXXX, or null. */
export function normalizeMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  let local = digits;
  if (digits.startsWith("880") && digits.length === 13) local = "0" + digits.slice(3);
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}
