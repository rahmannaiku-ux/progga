import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordInput } from "./password";

describe("validatePasswordInput", () => {
  it("accepts a reasonable password", () => {
    expect(validatePasswordInput("correcthorse")).toEqual({ ok: true });
  });

  it("rejects empty input", () => {
    const result = validatePasswordInput("");
    expect(result.ok).toBe(false);
  });

  it("rejects passwords under the minimum length", () => {
    const result = validatePasswordInput("short1");
    expect(result.ok).toBe(false);
  });

  it("rejects absurdly long passwords", () => {
    const result = validatePasswordInput("a".repeat(200));
    expect(result.ok).toBe(false);
  });

  it("does not require mixed character classes", () => {
    // Deliberately all-lowercase, no digits/symbols — length is the policy.
    expect(validatePasswordInput("allsimplewords").ok).toBe(true);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it successfully", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext password in the hash output", async () => {
    const password = "correct-horse-battery-staple";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const hashA = await hashPassword("same-password");
    const hashB = await hashPassword("same-password");
    expect(hashA).not.toEqual(hashB);
  });

  it("fails closed (returns false, does not throw) on a malformed hash", async () => {
    await expect(verifyPassword("anything", "not-a-real-argon2-hash")).resolves.toBe(false);
  });
});
