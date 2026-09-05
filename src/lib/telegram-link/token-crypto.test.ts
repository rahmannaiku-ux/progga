import { describe, it, expect } from "vitest";
import { generateRawLinkToken, newTokenExpiry, isTokenUsable } from "./token-crypto";

describe("generateRawLinkToken", () => {
  it("produces a token in the expected XXXX-XXXX-XXXX shape", () => {
    const token = generateRawLinkToken();
    expect(token).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  it("never includes ambiguous characters (0/O/1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      const token = generateRawLinkToken();
      expect(token).not.toMatch(/[01OIL]/);
    }
  });

  it("is not obviously predictable across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRawLinkToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("newTokenExpiry", () => {
  it("is exactly 10 minutes after the given time", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiry = newTokenExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });
});

describe("isTokenUsable", () => {
  const now = new Date("2026-01-01T00:10:00Z");

  it("is usable when unexpired and unused", () => {
    expect(isTokenUsable({ expiresAt: new Date("2026-01-01T00:20:00Z"), usedAt: null }, now)).toBe(true);
  });

  it("is not usable once expired", () => {
    expect(isTokenUsable({ expiresAt: new Date("2026-01-01T00:05:00Z"), usedAt: null }, now)).toBe(false);
  });

  it("is not usable once consumed, even if not yet expired", () => {
    expect(
      isTokenUsable({ expiresAt: new Date("2026-01-01T00:20:00Z"), usedAt: new Date("2026-01-01T00:01:00Z") }, now)
    ).toBe(false);
  });

  it("treats the exact expiry instant as expired (strict >, not >=)", () => {
    expect(isTokenUsable({ expiresAt: now, usedAt: null }, now)).toBe(false);
  });
});
