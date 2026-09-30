/**
 * Most students register with a phone number and never add an email, so
 * staff-facing lists must fall back to the phone instead of showing blank.
 */
export function contactLabel(user: { email?: string | null; phone?: string | null }): string {
  return user.phone || user.email || "";
}
