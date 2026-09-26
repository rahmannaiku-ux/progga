import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox caveat as the Phase 2 test files (see e.g.
// src/lib/auth/otp.test.ts) — written against the real contract, not
// executed here (no npm install / node_modules available).

const sessionFindUnique = vi.fn();
const sessionCreate = vi.fn();
const sessionUpdate = vi.fn();
const sessionUpdateMany = vi.fn();
const sessionFindMany = vi.fn();
const sessionFindFirst = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
      create: (...args: unknown[]) => sessionCreate(...args),
      update: (...args: unknown[]) => sessionUpdate(...args),
      updateMany: (...args: unknown[]) => sessionUpdateMany(...args),
      findMany: (...args: unknown[]) => sessionFindMany(...args),
      findFirst: (...args: unknown[]) => sessionFindFirst(...args),
    },
  },
}));

const cookieStore = new Map<string, { value: string }>();
const cookiesSet = vi.fn((name: string, value: string) => cookieStore.set(name, { value }));
const cookiesDelete = vi.fn((name: string) => cookieStore.delete(name));
const cookiesGet = vi.fn((name: string) => cookieStore.get(name));

vi.mock("next/headers", () => ({
  cookies: () => ({
    set: (name: string, value: string, _opts: unknown) => cookiesSet(name, value),
    get: (name: string) => cookiesGet(name),
    delete: (name: string) => cookiesDelete(name),
  }),
}));

const {
  createSession,
  validateSessionToken,
  revokeSessionById,
  revokeSessionByToken,
  revokeAllActiveSessionsForUser,
  hasActiveSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookieToken,
  SESSION_COOKIE_NAME,
} = await import("./session");

const { hashToken } = await import("@/lib/payments/reference");

const USER = { id: "user_1", isActive: true, isSuspended: false };

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionCreate.mockReset().mockImplementation(({ data }: any) =>
    Promise.resolve({
      id: "session_new",
      userId: data.userId,
      tokenHash: data.tokenHash,
      deviceId: data.deviceId ?? null,
      deviceLabel: data.deviceLabel ?? null,
      createdAt: data.createdAt,
      lastActivityAt: data.lastActivityAt,
      expiresAt: data.expiresAt,
      revokedAt: null,
    })
  );
  sessionUpdate.mockReset().mockResolvedValue({ id: "session_1", tokenHash: "hash1" });
  sessionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  sessionFindMany.mockReset().mockResolvedValue([]);
  sessionFindFirst.mockReset().mockResolvedValue(null);
  cookieStore.clear();
  cookiesSet.mockClear();
  cookiesDelete.mockClear();
  cookiesGet.mockClear();
});

describe("createSession", () => {
  it("stores only a hash of the token, never the raw token", async () => {
    const { rawToken, session } = await createSession("user_1");
    expect(session.tokenHash).toBe(hashToken(rawToken));
    expect(session.tokenHash).not.toBe(rawToken);
    // The create() call passed to Prisma must never include the raw token anywhere.
    const createCallArg = sessionCreate.mock.calls[0]![0];
    expect(JSON.stringify(createCallArg)).not.toContain(rawToken);
  });

  it("generates a different raw token on every call", async () => {
    const a = await createSession("user_1");
    const b = await createSession("user_1");
    expect(a.rawToken).not.toEqual(b.rawToken);
  });
});

describe("validateSessionToken", () => {
  it("returns null for a token that doesn't match any session", async () => {
    sessionFindUnique.mockResolvedValue(null);
    const result = await validateSessionToken("nonexistent-raw-token", { skipCache: true });
    expect(result).toBeNull();
  });

  it("returns the session+user for a valid, non-revoked, non-expired token", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "session_1",
      tokenHash: "irrelevant",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastActivityAt: new Date(),
      user: USER,
    });
    const result = await validateSessionToken("raw-token", { skipCache: true });
    expect(result).not.toBeNull();
    expect(result?.user.id).toBe("user_1");
  });

  it("rejects a revoked session", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "session_1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      lastActivityAt: new Date(),
      user: USER,
    });
    const result = await validateSessionToken("raw-token", { skipCache: true });
    expect(result).toBeNull();
  });

  it("rejects an expired session", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "session_1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      lastActivityAt: new Date(),
      user: USER,
    });
    const result = await validateSessionToken("raw-token", { skipCache: true });
    expect(result).toBeNull();
  });

  it("caches a positive result and skips the DB on the next call within the cache window", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "session_1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastActivityAt: new Date(),
      user: USER,
    });
    const token = "cache-test-token";
    await validateSessionToken(token);
    expect(sessionFindUnique).toHaveBeenCalledTimes(1);
    await validateSessionToken(token);
    // Second call within the cache window should NOT hit the DB again.
    expect(sessionFindUnique).toHaveBeenCalledTimes(1);
  });

  it("skipCache forces a fresh DB read even with a cached entry", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "session_1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastActivityAt: new Date(),
      user: USER,
    });
    const token = "skip-cache-token";
    await validateSessionToken(token);
    await validateSessionToken(token, { skipCache: true });
    expect(sessionFindUnique).toHaveBeenCalledTimes(2);
  });
});

describe("revocation", () => {
  it("revokeSessionByToken revokes by tokenHash and only affects non-revoked rows", async () => {
    await revokeSessionByToken("some-raw-token");
    expect(sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: hashToken("some-raw-token"), revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
  });

  it("revokeAllActiveSessionsForUser can exclude one session id", async () => {
    sessionFindMany.mockResolvedValue([{ id: "s1", tokenHash: "h1" }, { id: "s2", tokenHash: "h2" }]);
    const count = await revokeAllActiveSessionsForUser("user_1", { exceptSessionId: "s_new" });
    expect(count).toBe(2);
    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1", revokedAt: null, id: { not: "s_new" } }),
      })
    );
  });

  it("revokeAllActiveSessionsForUser is a no-op when there's nothing active", async () => {
    sessionFindMany.mockResolvedValue([]);
    const count = await revokeAllActiveSessionsForUser("user_1");
    expect(count).toBe(0);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });
});

describe("hasActiveSession", () => {
  it("true when an active session exists", async () => {
    sessionFindFirst.mockResolvedValue({ id: "s1" });
    expect(await hasActiveSession("user_1")).toBe(true);
  });

  it("false when none exists", async () => {
    sessionFindFirst.mockResolvedValue(null);
    expect(await hasActiveSession("user_1")).toBe(false);
  });
});

describe("cookie helpers", () => {
  it("setSessionCookie stores the raw token under SESSION_COOKIE_NAME", () => {
    setSessionCookie("raw-token-value", new Date(Date.now() + 1000));
    expect(cookiesSet).toHaveBeenCalledWith(SESSION_COOKIE_NAME, "raw-token-value");
  });

  it("getSessionCookieToken reads it back", () => {
    setSessionCookie("raw-token-value", new Date(Date.now() + 1000));
    expect(getSessionCookieToken()).toBe("raw-token-value");
  });

  it("clearSessionCookie removes it", () => {
    setSessionCookie("raw-token-value", new Date(Date.now() + 1000));
    clearSessionCookie();
    expect(getSessionCookieToken()).toBeNull();
  });
});
