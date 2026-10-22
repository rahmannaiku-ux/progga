import { describe, it, expect } from "vitest";
import { ADMIN_IDLE_MS, ADMIN_MFA_MAX_AGE_MS, newRecoveryCodes, twoStepState, consumeRecoveryCode } from "./admin-mfa";

const now = 1_800_000_000_000;
const at = (msAgo: number) => new Date(now - msAgo);

describe("twoStepState", () => {
  it("never applies to students and mentors", () => {
    expect(twoStepState({ role: "STUDENT", mfaEnabledAt: null }, { mfaVerifiedAt: null, lastActivityAt: at(0) }, now)).toBe("ok");
    expect(twoStepState({ role: "TEACHER", mfaEnabledAt: null }, { mfaVerifiedAt: null, lastActivityAt: at(0) }, now)).toBe("ok");
  });

  it("an admin without an authenticator must set one up", () => {
    expect(twoStepState({ role: "ADMIN", mfaEnabledAt: null }, { mfaVerifiedAt: null, lastActivityAt: at(0) }, now)).toBe("setup");
    expect(twoStepState({ role: "SUPER_ADMIN", mfaEnabledAt: null }, { mfaVerifiedAt: at(0), lastActivityAt: at(0) }, now)).toBe("setup");
  });

  it("asks for the code on a new session, after 12 hours, and after 2 idle hours", () => {
    const user = { role: "ADMIN", mfaEnabledAt: at(1000) };
    expect(twoStepState(user, { mfaVerifiedAt: null, lastActivityAt: at(0) }, now)).toBe("verify");
    expect(twoStepState(user, { mfaVerifiedAt: at(60_000), lastActivityAt: at(0) }, now)).toBe("ok");
    expect(twoStepState(user, { mfaVerifiedAt: at(ADMIN_MFA_MAX_AGE_MS + 1), lastActivityAt: at(0) }, now)).toBe("verify");
    expect(twoStepState(user, { mfaVerifiedAt: at(60_000), lastActivityAt: at(ADMIN_IDLE_MS + 1) }, now)).toBe("verify");
  });
});

describe("recovery codes", () => {
  it("ten readable codes, each usable once, typed in any case or spacing", () => {
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const left = consumeRecoveryCode(hashes, codes[3]!.toLowerCase().replace(/-/g, " "));
    expect(left).toHaveLength(9);
    expect(consumeRecoveryCode(left!, codes[3]!)).toBeNull();
    expect(consumeRecoveryCode(hashes, "AAAA-BBBB-CCCC")).toBeNull();
    expect(consumeRecoveryCode(hashes, "short")).toBeNull();
  });
});
