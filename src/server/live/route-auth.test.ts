import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox limitation as the other live/** tests in this change:
// needs vi.mock's module hoisting, which the node:test shim used
// elsewhere doesn't support. Written against the real function but
// UNVERIFIED until `npx vitest run` is run for real.

const getCurrentActiveSessionUser = vi.fn();

vi.mock("@/lib/auth/require-auth", () => ({
  getCurrentActiveSessionUser: (...a: unknown[]) => getCurrentActiveSessionUser(...a),
}));

const { resolveLiveApiUser } = await import("./route-auth");

function user(overrides: Partial<{ id: string; role: string; profileCompleted: boolean }>) {
  return { id: "user_1", role: "STUDENT", profileCompleted: true, ...overrides };
}

beforeEach(() => {
  getCurrentActiveSessionUser.mockReset();
});

describe("resolveLiveApiUser", () => {
  it("401s when there is no session", async () => {
    getCurrentActiveSessionUser.mockResolvedValue(null);
    const result = await resolveLiveApiUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("403s a STUDENT with an incomplete profile", async () => {
    getCurrentActiveSessionUser.mockResolvedValue(user({ role: "STUDENT", profileCompleted: false }));
    const result = await resolveLiveApiUser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body).toEqual({ error: "PROFILE_INCOMPLETE" });
    }
  });

  it("allows a STUDENT with a completed profile", async () => {
    getCurrentActiveSessionUser.mockResolvedValue(user({ role: "STUDENT", profileCompleted: true }));
    const result = await resolveLiveApiUser();
    expect(result).toEqual({ ok: true, user: { id: "user_1", role: "STUDENT" } });
  });

  it.each(["TEACHER", "ADMIN", "SUPER_ADMIN"] as const)(
    "never gates %s on profileCompleted, even when false",
    async (role) => {
      getCurrentActiveSessionUser.mockResolvedValue(user({ role, profileCompleted: false }));
      const result = await resolveLiveApiUser();
      expect(result).toEqual({ ok: true, user: { id: "user_1", role } });
    }
  );
});
