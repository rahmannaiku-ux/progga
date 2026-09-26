import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox caveat as the other Phase 2/3 test files — written
// against the real contract, not executed here (no npm install /
// node_modules available in this sandbox).

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

const requestRegistrationOtp = vi.fn();
const verifyRegistrationOtp = vi.fn();
const requestPasswordResetOtp = vi.fn();
const verifyPasswordResetOtp = vi.fn();

vi.mock("@/lib/auth/otp", () => ({
  requestRegistrationOtp: (...args: unknown[]) => requestRegistrationOtp(...args),
  verifyRegistrationOtp: (...args: unknown[]) => verifyRegistrationOtp(...args),
  requestPasswordResetOtp: (...args: unknown[]) => requestPasswordResetOtp(...args),
  verifyPasswordResetOtp: (...args: unknown[]) => verifyPasswordResetOtp(...args),
}));

const hashPassword = vi.fn();
const verifyPassword = vi.fn();
const validatePasswordInput = vi.fn();

vi.mock("@/lib/auth/password", () => ({
  hashPassword: (...args: unknown[]) => hashPassword(...args),
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  validatePasswordInput: (...args: unknown[]) => validatePasswordInput(...args),
}));

const createSession = vi.fn();
const revokeAllActiveSessionsForUser = vi.fn();
const revokeSessionByToken = vi.fn();
const hasActiveSession = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  revokeAllActiveSessionsForUser: (...args: unknown[]) => revokeAllActiveSessionsForUser(...args),
  revokeSessionByToken: (...args: unknown[]) => revokeSessionByToken(...args),
  hasActiveSession: (...args: unknown[]) => hasActiveSession(...args),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const isFeatureEnabled = vi.fn();
vi.mock("@/lib/config/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));

vi.mock("@/lib/auth/require-auth", () => ({
  isMultiSessionRole: (role: string) => role === "ADMIN" || role === "SUPER_ADMIN",
}));

const {
  requestRegistration,
  completeRegistration,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
} = await import("./auth-service");

const PHONE = "01712345678";
const CANONICAL_PHONE = "+8801712345678";
const FAKE_SESSION = { id: "session_new", expiresAt: new Date(Date.now() + 1000) };

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset().mockResolvedValue({});
  requestRegistrationOtp.mockReset().mockResolvedValue({ ok: true });
  verifyRegistrationOtp.mockReset().mockResolvedValue({ ok: true });
  requestPasswordResetOtp.mockReset().mockResolvedValue({ ok: true });
  verifyPasswordResetOtp.mockReset().mockResolvedValue({ ok: true });
  hashPassword.mockReset().mockResolvedValue("argon2-hash");
  verifyPassword.mockReset().mockResolvedValue(false);
  validatePasswordInput.mockReset().mockReturnValue({ ok: true });
  createSession.mockReset().mockResolvedValue({ rawToken: "raw-token-abc", session: FAKE_SESSION });
  revokeAllActiveSessionsForUser.mockReset().mockResolvedValue(0);
  revokeSessionByToken.mockReset().mockResolvedValue(undefined);
  hasActiveSession.mockReset().mockResolvedValue(false);
  checkRateLimit.mockReset().mockResolvedValue({ success: true });
  isFeatureEnabled.mockReset().mockResolvedValue(true);
});

describe("requestRegistration", () => {
  it("rejects when the registration feature flag is disabled, before any DB/OTP work", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const result = await requestRegistration(PHONE);
    expect(result).toEqual({ ok: false, reason: "registration_disabled" });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(requestRegistrationOtp).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone without touching the DB", async () => {
    const result = await requestRegistration("not-a-phone");
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a phone that's already registered, without sending an OTP", async () => {
    userFindUnique.mockResolvedValue({ id: "existing_user" });
    const result = await requestRegistration(PHONE);
    expect(result).toEqual({ ok: false, reason: "already_registered" });
    expect(requestRegistrationOtp).not.toHaveBeenCalled();
  });

  it("requests an OTP for a new phone number", async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await requestRegistration(PHONE);
    expect(result).toEqual({ ok: true });
    expect(requestRegistrationOtp).toHaveBeenCalledWith(CANONICAL_PHONE);
  });
});

describe("completeRegistration", () => {
  it("rejects when the registration feature flag is disabled, even with a valid OTP+password, before any DB write", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const result = await completeRegistration(PHONE, "123456", "goodpassword");
    expect(result).toEqual({ ok: false, reason: "registration_disabled" });
    expect(verifyRegistrationOtp).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("does not create a user when the OTP is invalid", async () => {
    verifyRegistrationOtp.mockResolvedValue({ ok: false, reason: "invalid_or_expired" });
    const result = await completeRegistration(PHONE, "000000", "goodpassword");
    expect(result).toEqual({ ok: false, reason: "otp_invalid" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("does not create a user when the OTP service reports rate limiting", async () => {
    verifyRegistrationOtp.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const result = await completeRegistration(PHONE, "123456", "goodpassword");
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("distinguishes max-attempts from a plain invalid/expired code", async () => {
    verifyRegistrationOtp.mockResolvedValue({ ok: false, reason: "max_attempts" });
    const result = await completeRegistration(PHONE, "123456", "goodpassword");
    expect(result).toEqual({ ok: false, reason: "otp_max_attempts" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("does not create a user when the password is invalid", async () => {
    validatePasswordInput.mockReturnValue({ ok: false, error: "too short" });
    const result = await completeRegistration(PHONE, "123456", "x");
    expect(result).toEqual({ ok: false, reason: "invalid_password", message: "too short" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates the account with phoneVerified=true and profileCompleted=false, and logs the user in", async () => {
    const createdUser = { id: "user_1", phone: CANONICAL_PHONE, role: "STUDENT" };
    userCreate.mockResolvedValue(createdUser);

    const result = await completeRegistration(PHONE, "123456", "goodpassword");

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: CANONICAL_PHONE,
          passwordHash: "argon2-hash",
          phoneVerified: true,
          profileCompleted: false,
          role: "STUDENT",
        }),
      })
    );
    expect(result).toEqual({ ok: true, rawToken: "raw-token-abc", session: FAKE_SESSION, user: createdUser });
  });

  it("does not invent StudentProfile field values on creation, and also creates an empty HeroStats row (Phase 5 fix — matches the Clerk paths' nested create)", async () => {
    userCreate.mockResolvedValue({ id: "user_1" });
    await completeRegistration(PHONE, "123456", "goodpassword");
    const createArg = userCreate.mock.calls[0]![0];
    expect(createArg.data.studentProfile).toEqual({ create: {} });
    expect(createArg.data.heroStats).toEqual({ create: {} });
  });

  it("treats a duplicate-phone race (P2002) as already_registered rather than crashing", async () => {
    const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    userCreate.mockRejectedValue(err);
    const result = await completeRegistration(PHONE, "123456", "goodpassword");
    expect(result).toEqual({ ok: false, reason: "already_registered" });
  });
});

describe("login", () => {
  it("rejects an invalid phone", async () => {
    const result = await login("not-a-phone", "whatever");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("is rate limited", async () => {
    checkRateLimit.mockResolvedValue({ success: false });
    const result = await login(PHONE, "whatever");
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("rejects a nonexistent account with the same generic reason as a wrong password (no enumeration)", async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await login(PHONE, "whatever");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    // Timing-parity: still calls verifyPassword against a dummy hash even with no account.
    expect(verifyPassword).toHaveBeenCalled();
  });

  it("rejects a wrong password for an existing account", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", passwordHash: "real-hash", role: "STUDENT", isActive: true, isSuspended: false });
    verifyPassword.mockResolvedValue(false);
    const result = await login(PHONE, "wrong");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects an inactive/suspended account after password checks out", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", passwordHash: "real-hash", role: "STUDENT", isActive: false, isSuspended: false });
    verifyPassword.mockResolvedValue(true);
    const result = await login(PHONE, "correct");
    expect(result).toEqual({ ok: false, reason: "account_inactive" });
  });

  it("logs a student in normally when there's no existing active session", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", passwordHash: "real-hash", role: "STUDENT", isActive: true, isSuspended: false });
    verifyPassword.mockResolvedValue(true);
    hasActiveSession.mockResolvedValue(false);

    const result = await login(PHONE, "correct");
    expect(result).toEqual({ ok: true, rawToken: "raw-token-abc", session: FAKE_SESSION, user: expect.any(Object) });
    expect(revokeAllActiveSessionsForUser).not.toHaveBeenCalled();
  });

  it("returns takeover_required for a student with an existing active session, without creating a new session", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", passwordHash: "real-hash", role: "STUDENT", isActive: true, isSuspended: false });
    verifyPassword.mockResolvedValue(true);
    hasActiveSession.mockResolvedValue(true);

    const result = await login(PHONE, "correct");
    expect(result).toEqual({ ok: false, reason: "takeover_required" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("confirmTakeover creates the new session and revokes every other active one", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", passwordHash: "real-hash", role: "STUDENT", isActive: true, isSuspended: false });
    verifyPassword.mockResolvedValue(true);
    hasActiveSession.mockResolvedValue(true);

    const result = await login(PHONE, "correct", { confirmTakeover: true });
    expect(result.ok).toBe(true);
    expect(createSession).toHaveBeenCalledWith("user_1");
    expect(revokeAllActiveSessionsForUser).toHaveBeenCalledWith("user_1", { exceptSessionId: FAKE_SESSION.id });
  });

  it("admin accounts skip the takeover check entirely, even with an existing active session", async () => {
    userFindUnique.mockResolvedValue({ id: "admin_1", passwordHash: "real-hash", role: "ADMIN", isActive: true, isSuspended: false });
    verifyPassword.mockResolvedValue(true);
    hasActiveSession.mockResolvedValue(true);

    const result = await login(PHONE, "correct");
    expect(result.ok).toBe(true);
    expect(revokeAllActiveSessionsForUser).not.toHaveBeenCalled();
    // hasActiveSession shouldn't even need to be consulted for an admin.
    expect(hasActiveSession).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("revokes the session for the given raw token", async () => {
    await logout("raw-token-value");
    expect(revokeSessionByToken).toHaveBeenCalledWith("raw-token-value");
  });
});

describe("requestPasswordReset", () => {
  it("passes through to the Phase 2 OTP service (account-enumeration protection lives there)", async () => {
    requestPasswordResetOtp.mockResolvedValue({ ok: true });
    const result = await requestPasswordReset(PHONE);
    expect(result).toEqual({ ok: true });
    expect(requestPasswordResetOtp).toHaveBeenCalledWith(PHONE);
  });
});

describe("resetPassword", () => {
  it("rejects an invalid phone", async () => {
    const result = await resetPassword("not-a-phone", "123456", "newpassword");
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("rejects an invalid/expired OTP without touching the password", async () => {
    verifyPasswordResetOtp.mockResolvedValue({ ok: false, reason: "invalid_or_expired" });
    const result = await resetPassword(PHONE, "000000", "newpassword");
    expect(result).toEqual({ ok: false, reason: "otp_invalid" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("distinguishes max-attempts from a plain invalid/expired code", async () => {
    verifyPasswordResetOtp.mockResolvedValue({ ok: false, reason: "max_attempts" });
    const result = await resetPassword(PHONE, "000000", "newpassword");
    expect(result).toEqual({ ok: false, reason: "otp_max_attempts" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid new password", async () => {
    validatePasswordInput.mockReturnValue({ ok: false, error: "too short" });
    const result = await resetPassword(PHONE, "123456", "x");
    expect(result).toEqual({ ok: false, reason: "invalid_password", message: "too short" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("updates the password hash and revokes every existing session on success", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1" });
    const result = await resetPassword(PHONE, "123456", "newgoodpassword");
    expect(result).toEqual({ ok: true });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { passwordHash: "argon2-hash" } });
    expect(revokeAllActiveSessionsForUser).toHaveBeenCalledWith("user_1");
  });
});
