/**
 * Central place mapping auth service `reason` codes to user-safe copy.
 * Never derive an auth error message from a raw Error/Prisma
 * exception in a component — go through here so nothing internal
 * (stack traces, SQL, exception names) can leak to the browser, and so
 * wording stays consistent across login/register/reset.
 */

const GENERIC = "Something went wrong. Please try again.";

export function loginErrorMessage(reason: string): string {
  switch (reason) {
    case "invalid_credentials":
      // Deliberately identical whether the phone doesn't exist or the
      // password is wrong — see auth-service.ts's login().
      return "Incorrect phone number or password.";
    case "account_inactive":
      return "This account is inactive. Please contact support.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "invalid_phone":
      return "Enter a valid Bangladeshi phone number.";
    default:
      return GENERIC;
  }
}

export function registrationOtpRequestErrorMessage(reason: string, retryAfterSeconds?: number): string {
  switch (reason) {
    case "invalid_phone":
      return "Enter a valid Bangladeshi phone number.";
    case "already_registered":
      return "An account already exists for this phone number. Try signing in instead.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "cooldown":
      return retryAfterSeconds
        ? `Please wait ${retryAfterSeconds}s before requesting another code.`
        : "Please wait a moment before requesting another code.";
    case "quota_exceeded":
      return "You have reached the maximum number of OTP requests. Please try again later.";
    case "registration_disabled":
      return "New sign-ups are paused right now. Please check back soon.";
    default:
      return GENERIC;
  }
}

export function completeRegistrationErrorMessage(reason: string, message?: string): string {
  switch (reason) {
    case "invalid_phone":
      return "Enter a valid Bangladeshi phone number.";
    case "otp_invalid":
      return "That code is incorrect or has expired. Please try again or request a new one.";
    case "otp_max_attempts":
      return "Too many incorrect attempts for that code. Please request a new one.";
    case "already_registered":
      return "An account already exists for this phone number. Try signing in instead.";
    case "invalid_password":
      return message ?? "Please choose a different password.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "registration_disabled":
      return "New sign-ups are paused right now. Please check back soon.";
    default:
      return GENERIC;
  }
}

export function passwordResetRequestErrorMessage(reason: string, retryAfterSeconds?: number): string {
  switch (reason) {
    case "invalid_phone":
      return "Enter a valid Bangladeshi phone number.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "cooldown":
      return retryAfterSeconds
        ? `Please wait ${retryAfterSeconds}s before requesting another code.`
        : "Please wait a moment before requesting another code.";
    case "quota_exceeded":
      return "You have reached the maximum number of OTP requests. Please try again later.";
    default:
      return GENERIC;
  }
}

export function resetPasswordErrorMessage(reason: string, message?: string): string {
  switch (reason) {
    case "invalid_phone":
      return "Enter a valid Bangladeshi phone number.";
    case "otp_invalid":
      return "That code is incorrect or has expired. Please try again or request a new one.";
    case "otp_max_attempts":
      return "Too many incorrect attempts for that code. Please request a new one.";
    case "invalid_password":
      return message ?? "Please choose a different password.";
    case "account_not_found":
      // Only reachable in a genuinely unexpected internal-consistency
      // case (see resetPassword's comment in auth-service.ts) — not an
      // enumeration leak, since a caller only ever gets here after
      // already successfully verifying a reset OTP.
      return GENERIC;
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return GENERIC;
  }
}
