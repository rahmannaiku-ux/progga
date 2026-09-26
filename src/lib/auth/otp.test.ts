import { describe, it, expect, vi, beforeEach } from "vitest";

// Same situation as src/server/live/live-access.test.ts (see its header
// comment): written against the real otp.ts contract and the real
// Prisma Otp field names (verified by reading prisma/schema.prisma),
// but UNVERIFIED — this sandbox has no network access, so `npm install`
// cannot run and vitest itself is unavailable here. Please run
// `npx vitest run src/lib/auth/otp.test.ts` and report any failures.

const otpFindFirst = vi.fn();
const otpFindMany = vi.fn();
const otpUpdateMany = vi.fn();
const otpCreate = vi.fn();
const userFindUnique = vi.fn();
const checkRateLimit = vi.fn();
const sendSms = vi.fn();
const executeRaw = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    otp: {
      findFirst: (...args: unknown[]) => otpFindFirst(...args),
      findMany: (...args: unknown[]) => otpFindMany(...args),
      updateMany: (...args: unknown[]) => otpUpdateMany(...args),
      create: (...args: unknown[]) => otpCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    // $transaction has two call shapes in otp.ts:
    //  - array-form (not used by this file anymore, kept for safety)
    //  - interactive/callback-form: db.$transaction(async (tx) => {...}),
    //    used by reserveOtpSlot for the quota check. `tx` exposes the
    //    same mocked otp.* fns plus a no-op $executeRaw (the advisory
    //    lock itself has no real concurrency semantics to verify in a
    //    single-threaded mock — what's tested is that it's called with
    //    the right key, and that the count-then-create logic inside is
    //    correct, not Postgres's own locking behavior).
    $transaction: (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const tx = {
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
        otp: {
          findMany: (...args: unknown[]) => otpFindMany(...args),
          updateMany: (...args: unknown[]) => otpUpdateMany(...args),
          create: (...args: unknown[]) => otpCreate(...args),
        },
      };
      return (arg as (tx: unknown) => Promise<unknown>)(tx);
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/sms/onecodesoft", () => ({
  getSmsProvider: () => ({ sendSms: (...args: unknown[]) => sendSms(...args) }),
}));

process.env.OTP_HMAC_SECRET = "test-otp-hmac-secret";

const {
  requestRegistrationOtp,
  verifyRegistrationOtp,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
} = await import("./otp");

const PHONE = "01712345678";
const CANONICAL_PHONE = "+8801712345678";
const OTHER_PHONE = "+8801812345678";

beforeEach(() => {
  otpFindFirst.mockReset().mockResolvedValue(null);
  otpFindMany.mockReset().mockResolvedValue([]); // no recent requests => quota never blocks by default
  otpUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  otpCreate.mockReset().mockResolvedValue({ id: "otp_1" });
  userFindUnique.mockReset().mockResolvedValue(null);
  checkRateLimit.mockReset().mockResolvedValue({ success: true });
  sendSms.mockReset().mockResolvedValue(undefined);
  executeRaw.mockReset().mockResolvedValue(undefined);
});

describe("requestRegistrationOtp", () => {
  it("rejects an invalid phone number without touching the DB or rate limiter", async () => {
    const result = await requestRegistrationOtp("not-a-phone");
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("is rate limited when checkRateLimit reports failure", async () => {
    checkRateLimit.mockResolvedValue({ success: false });
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("respects the resend cooldown for a just-sent, still-active OTP", async () => {
    otpFindFirst.mockResolvedValue({
      consumedAt: null,
      lastSentAt: new Date(Date.now() - 5_000), // 5s ago, cooldown is 60s
    });
    const result = await requestRegistrationOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("cooldown");
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("allows a resend once the cooldown has elapsed", async () => {
    otpFindFirst.mockResolvedValue({
      consumedAt: null,
      lastSentAt: new Date(Date.now() - 61_000), // 61s ago, cooldown is 60s
    });
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: true });
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it("ignores the cooldown of an already-consumed OTP", async () => {
    otpFindFirst.mockResolvedValue({
      consumedAt: new Date(), // already used
      lastSentAt: new Date(), // "just now" — would fail cooldown if consumedAt were ignored
    });
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: true });
  });

  it("sends via the SMS provider using the normalized phone number", async () => {
    await requestRegistrationOtp(PHONE);
    expect(sendSms).toHaveBeenCalledWith(CANONICAL_PHONE, expect.stringContaining("Proggaa"));
  });

  it("supersedes previous active OTPs for the same phone+purpose (inside the same quota-locked transaction as creation)", async () => {
    await requestRegistrationOtp(PHONE);
    expect(otpUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: CANONICAL_PHONE, purpose: "REGISTRATION", consumedAt: null }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      })
    );
    expect(otpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: CANONICAL_PHONE, purpose: "REGISTRATION" }),
      })
    );
  });

  it("propagates an SMS provider failure (e.g. the unconfigured Onecodesoft stub) rather than reporting fake success", async () => {
    sendSms.mockRejectedValue(new Error("Onecodesoft SMS provider is not configured"));
    await expect(requestRegistrationOtp(PHONE)).rejects.toThrow(/not configured/);
  });
});

describe("verifyRegistrationOtp", () => {
  function mockActiveOtp(overrides: Partial<Record<string, unknown>> = {}) {
    const otp = {
      id: "otp_1",
      phone: CANONICAL_PHONE,
      purpose: "REGISTRATION",
      codeHash: undefined as string | undefined,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
    otpFindFirst.mockResolvedValue(otp);
    return otp;
  }

  it("rejects when there is no active OTP for the phone", async () => {
    otpFindFirst.mockResolvedValue(null);
    const result = await verifyRegistrationOtp(PHONE, "123456");
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("rejects an expired OTP", async () => {
    mockActiveOtp({ expiresAt: new Date(Date.now() - 1000) });
    const result = await verifyRegistrationOtp(PHONE, "123456");
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
    // Must not even attempt to claim/increment an attempt on an already-expired code.
    expect(otpUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects once max attempts has already been reached", async () => {
    mockActiveOtp({ attempts: 5, maxAttempts: 5 });
    const result = await verifyRegistrationOtp(PHONE, "123456");
    expect(result).toEqual({ ok: false, reason: "max_attempts" });
  });

  it("rejects a wrong code and leaves the OTP unconsumed", async () => {
    mockActiveOtp({ codeHash: "definitely-not-a-real-hash" });
    const result = await verifyRegistrationOtp(PHONE, "000000");
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
    // One updateMany to claim/increment the attempt; no second call to consume.
    expect(otpUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("accepts the correct code and consumes the OTP", async () => {
    // Derive the real HMAC the implementation would compute, so this
    // test exercises the actual comparison rather than a canned value.
    const { createHmac } = await import("crypto");
    const code = "654321";
    const codeHash = createHmac("sha256", "test-otp-hmac-secret")
      .update(`${CANONICAL_PHONE}:REGISTRATION:${code}`)
      .digest("hex");
    mockActiveOtp({ codeHash });

    const result = await verifyRegistrationOtp(PHONE, code);
    expect(result).toEqual({ ok: true });
    // Once to claim the attempt, once to mark consumed.
    expect(otpUpdateMany).toHaveBeenCalledTimes(2);
    expect(otpUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "otp_1", consumedAt: null }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      })
    );
  });

  it("treats a lost attempt-claim race (updateMany count 0) as max_attempts, not a crash", async () => {
    mockActiveOtp();
    otpUpdateMany.mockResolvedValueOnce({ count: 0 }); // simulates another concurrent verify winning the race
    const result = await verifyRegistrationOtp(PHONE, "123456");
    expect(result).toEqual({ ok: false, reason: "max_attempts" });
  });

  it("treats a lost consume race (second updateMany count 0) as invalid_or_expired, not a false success", async () => {
    const { createHmac } = await import("crypto");
    const code = "111222";
    const codeHash = createHmac("sha256", "test-otp-hmac-secret")
      .update(`${CANONICAL_PHONE}:REGISTRATION:${code}`)
      .digest("hex");
    mockActiveOtp({ codeHash });
    otpUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // claim succeeds
      .mockResolvedValueOnce({ count: 0 }); // consume loses the race
    const result = await verifyRegistrationOtp(PHONE, code);
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("is rate limited when checkRateLimit reports failure", async () => {
    checkRateLimit.mockResolvedValue({ success: false });
    const result = await verifyRegistrationOtp(PHONE, "123456");
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(otpFindFirst).not.toHaveBeenCalled();
  });

  it("verifying (correctly or incorrectly) never restores the 12h request quota — verification only reads/updates the Otp row it found, never touches findMany/create", async () => {
    mockActiveOtp({ codeHash: "irrelevant" });
    await verifyRegistrationOtp(PHONE, "000000");
    expect(otpFindMany).not.toHaveBeenCalled();
    expect(otpCreate).not.toHaveBeenCalled();
  });
});

describe("registration vs password-reset purpose isolation", () => {
  it("looks up REGISTRATION and PASSWORD_RESET OTPs separately", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1" });
    otpFindFirst.mockResolvedValue(null);

    await verifyRegistrationOtp(PHONE, "123456");
    expect(otpFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ purpose: "REGISTRATION" }) })
    );

    await verifyPasswordResetOtp(PHONE, "123456");
    expect(otpFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ purpose: "PASSWORD_RESET" }) })
    );
  });
});

describe("requestPasswordResetOtp — account enumeration protection", () => {
  it("reports generic success, sends no SMS, but STILL reserves a slot (Otp row + quota consumption) when no account owns the phone — so a probing caller can't tell 'no account' apart from 'real account, quota hit'", async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await requestPasswordResetOtp(PHONE);
    expect(result).toEqual({ ok: true });
    expect(sendSms).not.toHaveBeenCalled();
    expect(otpCreate).toHaveBeenCalledTimes(1);
  });

  it("reports the same generic success and actually sends an SMS when an account does own the phone", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1" });
    const result = await requestPasswordResetOtp(PHONE);
    expect(result).toEqual({ ok: true });
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it("a nonexistent phone can hit the SAME cooldown response a real account would — response shape doesn't leak account existence", async () => {
    userFindUnique.mockResolvedValue(null);
    otpFindFirst.mockResolvedValue({ consumedAt: null, lastSentAt: new Date(Date.now() - 5_000) });
    const result = await requestPasswordResetOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cooldown");
  });

  it("a nonexistent phone can hit the SAME quota_exceeded response a real account would", async () => {
    userFindUnique.mockResolvedValue(null);
    otpFindMany.mockResolvedValue([
      { createdAt: new Date(Date.now() - 60_000) },
      { createdAt: new Date(Date.now() - 120_000) },
      { createdAt: new Date(Date.now() - 180_000) },
    ]);
    const result = await requestPasswordResetOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quota_exceeded");
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("still distinguishes invalid phone input (not an enumeration leak — true regardless of any account)", async () => {
    const result = await requestPasswordResetOtp("not-a-phone");
    expect(result).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("still applies rate limiting before revealing anything about account existence", async () => {
    checkRateLimit.mockResolvedValue({ success: false });
    const result = await requestPasswordResetOtp(PHONE);
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("12-hour OTP request quota", () => {
  function withRecentRequests(count: number, spacedMinutesApart = 60) {
    // Ascending by createdAt (oldest first), matching the real
    // `orderBy: { createdAt: "asc" }` the implementation queries with —
    // recentRequests[0] is assumed to be the oldest for the
    // retryAfterSeconds calculation.
    otpFindMany.mockResolvedValue(
      Array.from({ length: count }, (_, i) => ({
        createdAt: new Date(Date.now() - (count - i) * spacedMinutesApart * 60_000),
      }))
    );
  }

  it("1st request of the window is allowed", async () => {
    withRecentRequests(0);
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: true });
  });

  it("2nd request is allowed", async () => {
    withRecentRequests(1);
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: true });
  });

  it("3rd request is allowed", async () => {
    withRecentRequests(2);
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: true });
  });

  it("4th request within the 12h window is BLOCKED, and never reaches the SMS provider", async () => {
    withRecentRequests(3);
    const result = await requestRegistrationOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quota_exceeded");
    expect(sendSms).not.toHaveBeenCalled();
    expect(otpCreate).not.toHaveBeenCalled();
  });

  it("provides a retryAfterSeconds based on the oldest request still inside the window", async () => {
    // Oldest of the 3 was sent 11 hours ago -> ~1 hour left in its window.
    otpFindMany.mockResolvedValue([
      { createdAt: new Date(Date.now() - 11 * 60 * 60 * 1000) },
      { createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      { createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000) },
    ]);
    const result = await requestRegistrationOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("quota_exceeded");
      // Should be roughly 1 hour (3600s), not 12 hours.
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThan(3700);
    }
  });

  it("a request that has aged out of the 12h window doesn't count — findMany is queried with a >12h-ago lower bound", async () => {
    await requestRegistrationOtp(PHONE);
    const call = otpFindMany.mock.calls[0]![0];
    const gt = call.where.createdAt.gt as Date;
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    // Allow a small tolerance for test execution time.
    expect(Math.abs(gt.getTime() - twelveHoursAgo)).toBeLessThan(5000);
  });

  it("counts across BOTH registration and password-reset requests for the same phone (combined pool, not per-purpose)", async () => {
    withRecentRequests(3);
    userFindUnique.mockResolvedValue({ id: "user_1" });
    const result = await requestPasswordResetOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quota_exceeded");
    // The query itself must not filter by purpose.
    const call = otpFindMany.mock.calls[0]![0];
    expect(call.where.purpose).toBeUndefined();
  });

  it("a resend consumes a quota slot exactly like a fresh request (same code path)", async () => {
    withRecentRequests(3);
    otpFindFirst.mockResolvedValue({ consumedAt: new Date(), lastSentAt: new Date(Date.now() - 120_000) }); // past cooldown, so it reaches the quota check
    const result = await requestRegistrationOtp(PHONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quota_exceeded");
  });

  it("a failed OTP verification does not restore quota (verify never touches findMany/create — see the dedicated test above)", async () => {
    withRecentRequests(3);
    const blocked = await requestRegistrationOtp(PHONE);
    expect(blocked).toEqual({ ok: false, reason: "quota_exceeded", retryAfterSeconds: expect.any(Number) });
    // A wrong-code verify attempt against some unrelated OTP shouldn't touch the quota machinery at all.
    otpFindFirst.mockResolvedValue({
      id: "otp_x",
      codeHash: "irrelevant",
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSentAt: new Date(Date.now() - 120_000), // past cooldown, so the follow-up request reaches the quota check
    });
    await verifyRegistrationOtp(PHONE, "000000");
    const stillBlocked = await requestRegistrationOtp(PHONE);
    expect(stillBlocked).toEqual({ ok: false, reason: "quota_exceeded", retryAfterSeconds: expect.any(Number) });
  });

  it("a successful OTP verification does not restore quota", async () => {
    withRecentRequests(3);
    const { createHmac } = await import("crypto");
    const code = "654321";
    const codeHash = createHmac("sha256", "test-otp-hmac-secret")
      .update(`${CANONICAL_PHONE}:REGISTRATION:${code}`)
      .digest("hex");
    otpFindFirst.mockResolvedValue({
      id: "otp_x",
      codeHash,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSentAt: new Date(Date.now() - 120_000), // past cooldown, so the follow-up request reaches the quota check
    });
    const verifyResult = await verifyRegistrationOtp(PHONE, code);
    expect(verifyResult).toEqual({ ok: true });

    const nextRequest = await requestRegistrationOtp(PHONE);
    expect(nextRequest.ok).toBe(false);
    if (!nextRequest.ok) expect(nextRequest.reason).toBe("quota_exceeded");
  });

  it("different phone numbers have independent quotas", async () => {
    // otpFindMany is keyed by the `phone` argument the implementation
    // passes in its `where` clause — simulate PHONE being exhausted and
    // OTHER_PHONE being fresh by asserting on the call args per phone.
    otpFindMany.mockImplementation(({ where }: { where: { phone: string } }) =>
      Promise.resolve(where.phone === CANONICAL_PHONE ? [{ createdAt: new Date() }, { createdAt: new Date() }, { createdAt: new Date() }] : [])
    );

    const blockedPhoneResult = await requestRegistrationOtp(PHONE);
    expect(blockedPhoneResult.ok).toBe(false);

    const otherPhoneResult = await requestRegistrationOtp("01812345678");
    expect(otherPhoneResult).toEqual({ ok: true });
    expect(otpFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ phone: OTHER_PHONE }) }));
  });

  it("OTP_DEV_BYPASS_QUOTA=1 outside production lets a request through past an exhausted quota (local-testing escape hatch only)", async () => {
    withRecentRequests(3);
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.OTP_DEV_BYPASS_QUOTA = "1";
    try {
      const result = await requestRegistrationOtp(PHONE);
      expect(result).toEqual({ ok: true });
      expect(sendSms).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.OTP_DEV_BYPASS_QUOTA;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("OTP_DEV_BYPASS_QUOTA=1 is ignored when NODE_ENV=production — the bypass can never reach production regardless of the flag", async () => {
    withRecentRequests(3);
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.OTP_DEV_BYPASS_QUOTA = "1";
    try {
      const result = await requestRegistrationOtp(PHONE);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("quota_exceeded");
      expect(sendSms).not.toHaveBeenCalled();
    } finally {
      delete process.env.OTP_DEV_BYPASS_QUOTA;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("equivalent Bangladesh phone formats share the same quota (normalized before the quota check)", async () => {
    withRecentRequests(3);
    const localFormat = await requestRegistrationOtp("01712345678");
    const plusFormat = await requestRegistrationOtp("+8801712345678");
    const noPlusFormat = await requestRegistrationOtp("8801712345678");
    for (const result of [localFormat, plusFormat, noPlusFormat]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("quota_exceeded");
    }
    for (const call of otpFindMany.mock.calls) {
      expect(call[0].where.phone).toBe(CANONICAL_PHONE);
    }
  });

  it("acquires a Postgres advisory lock keyed by the phone before counting/creating (the concurrency-safety mechanism)", async () => {
    await requestRegistrationOtp(PHONE);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    // Tagged-template $executeRaw calls are invoked as (strings, ...values) — the phone is the interpolated value.
    const callArgs = executeRaw.mock.calls[0];
    expect(callArgs).toContain(CANONICAL_PHONE);
  });

  it("blocked-by-quota never calls the Onecodesoft provider (checked before SMS dispatch)", async () => {
    withRecentRequests(3);
    await requestRegistrationOtp(PHONE);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("the short-term rate limiter and the 12h quota are independent layers — passing one doesn't skip the other", async () => {
    // Short-term limiter says blocked, quota would have allowed it (0 recent) — still blocked.
    checkRateLimit.mockResolvedValue({ success: false });
    withRecentRequests(0);
    const result = await requestRegistrationOtp(PHONE);
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(otpFindMany).not.toHaveBeenCalled(); // short-term limiter is checked first, quota check never even runs

    // Short-term limiter passes, but quota is exhausted — still blocked, by the quota this time.
    checkRateLimit.mockResolvedValue({ success: true });
    withRecentRequests(3);
    const result2 = await requestRegistrationOtp(PHONE);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.reason).toBe("quota_exceeded");
  });
});
