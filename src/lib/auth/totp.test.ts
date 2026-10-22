import { describe, it, expect } from "vitest";
import { base32Decode, base32Encode, newTotpSecret, otpauthUrl, totpCode, totpStep, verifyTotp } from "./totp";

// RFC 6238 appendix B: the SHA-1 secret is the ASCII "12345678901234567890"
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000), 8)).toBe("94287082");
    expect(totpCode(RFC_SECRET, totpStep(1111111109_000), 8)).toBe("07081804");
    expect(totpCode(RFC_SECRET, totpStep(1234567890_000), 8)).toBe("89005924");
    expect(totpCode(RFC_SECRET, totpStep(20000000000_000), 8)).toBe("65353130");
  });

  it("base32 round-trips and new secrets are 32 characters", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("accepts the current code and one step either side, never a used step again", () => {
    const now = 1_800_000_000_000;
    const secret = newTotpSecret();
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), now, null)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull(); // replay
    expect(verifyTotp(secret, "12345", now, null)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now, null)).toBeNull();
  });

  it("builds an authenticator link", () => {
    expect(otpauthUrl("ABC", "01712345678")).toBe(
      "otpauth://totp/Proggaa%20Admin%3A01712345678?secret=ABC&issuer=Proggaa%20Admin&algorithm=SHA1&digits=6&period=30"
    );
  });
});
