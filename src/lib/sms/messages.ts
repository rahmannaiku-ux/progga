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
