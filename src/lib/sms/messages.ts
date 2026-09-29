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

export function phoneChangeOtpMessage(code: string): string {
  return `Proggaa code to confirm your new phone number: ${code}. It expires in 5 minutes. Do not share this code with anyone.`;
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
  invoiceUrl,
}: {
  studentName: string;
  courseTitle: string;
  amountCents: number;
  /** Price before a coupon, when one was used — shown so the student sees what they saved. */
  originalCents?: number | null;
  currency: string;
  reference: string;
  /** Absolute link to the printable invoice (see invoiceUrlFor). */
  invoiceUrl?: string | null;
}): string {
  // Always BDT (see formatMoney); `currency` is accepted but not shown.
  void currency;
  const money = (cents: number) =>
    `BDT ${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const greeting = studentName.trim() ? `Congratulations ${studentName.trim()}!` : "Congratulations!";
  const price =
    originalCents != null && originalCents > amountCents
      ? `Paid: ${money(amountCents)} (was ${money(originalCents)})`
      : `Paid: ${money(amountCents)}`;
  const invoice = invoiceUrl ? ` Invoice: ${invoiceUrl}` : "";
  return `${greeting} Your purchase of "${courseTitle}" on Proggaa is confirmed. ${price}. Ref: ${reference}. The course is now unlocked on your dashboard.${invoice}`;
}

/** Public site origin for links sent outside the app (SMS). Never localhost. */
const DEFAULT_PUBLIC_SITE_URL = "https://progga-zeta.vercel.app";

export function publicSiteUrl(envUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const url = envUrl?.trim();
  // A dev/local value (the .env.example default) would give students a dead link.
  if (!url || /localhost|127\.0\.0\.1/.test(url)) return DEFAULT_PUBLIC_SITE_URL;
  return url.replace(/\/+$/, "");
}

export function invoiceUrlFor(paymentId: string, baseUrl: string = publicSiteUrl()): string {
  return `${baseUrl}/payments/${encodeURIComponent(paymentId)}/invoice`;
}
