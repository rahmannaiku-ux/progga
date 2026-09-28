/**
 * Outbound SMS message text, kept separate from provider transport
 * (see src/lib/sms/onecodesoft.ts) so message copy can change without
 * touching request-formatting/auth logic, and so the provider file
 * never needs to know *why* it's sending a given string.
 */

export function registrationOtpMessage(code: string): string {
  return `Proggaa verification code: ${code}. It expires in 5 minutes. Do not share this code with anyone.`;
}

export function passwordResetOtpMessage(code: string): string {
  return `Proggaa password reset code: ${code}. It expires in 5 minutes. Do not share this code with anyone. If you didn't request this, ignore this message.`;
}

/**
 * Sent once, right after a payment flips to PAID (see
 * markPaidAndEnroll in server/services/payment-verification.ts).
 * Plain ASCII on purpose ("BDT", not "৳") so the message stays in the
 * cheaper GSM-7 encoding instead of forcing a Unicode SMS.
 */
export function purchaseSuccessMessage({
  studentName,
  courseTitle,
  amountCents,
  originalCents,
  currency,
  reference,
}: {
  studentName: string;
  courseTitle: string;
  amountCents: number;
  /** Price before a coupon, when one was used — shown so the student sees what they saved. */
  originalCents?: number | null;
  currency: string;
  reference: string;
}): string {
  const money = (cents: number) =>
    `${currency} ${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const greeting = studentName.trim() ? `Congratulations ${studentName.trim()}!` : "Congratulations!";
  const price =
    originalCents != null && originalCents > amountCents
      ? `Paid: ${money(amountCents)} (was ${money(originalCents)})`
      : `Paid: ${money(amountCents)}`;
  return `${greeting} Your purchase of "${courseTitle}" on Proggaa is confirmed. ${price}. Ref: ${reference}. The course is now unlocked on your dashboard.`;
}
