import { describe, it, expect } from "vitest";
import { normalizeBangladeshPhone, isValidBangladeshPhone, maskPhone } from "./phone";

describe("normalizeBangladeshPhone", () => {
  it("normalizes local and E.164 forms to the same canonical value", () => {
    const local = "01712345678";
    const withCountryCode = "8801712345678";
    const withPlus = "+8801712345678";
    const withIntlPrefix = "008801712345678";
    const withPunctuation = "+880 171-234 5678";

    const expected = "+8801712345678";
    expect(normalizeBangladeshPhone(local)).toBe(expected);
    expect(normalizeBangladeshPhone(withCountryCode)).toBe(expected);
    expect(normalizeBangladeshPhone(withPlus)).toBe(expected);
    expect(normalizeBangladeshPhone(withIntlPrefix)).toBe(expected);
    expect(normalizeBangladeshPhone(withPunctuation)).toBe(expected);
  });

  it("accepts all current operator prefixes 013-019", () => {
    for (const prefix of ["013", "014", "015", "016", "017", "018", "019"]) {
      const local = `${prefix}12345678`;
      // Canonical form drops the local-dial leading "0" (see the
      // module docstring): "013XXXXXXXX" (11 digits) -> "+88013XXXXXXXX"
      // minus that leading zero, i.e. "+880" + local.slice(1).
      expect(normalizeBangladeshPhone(local)).toBe(`+880${local.slice(1)}`);
    }
  });

  it("rejects an invalid operator prefix", () => {
    expect(normalizeBangladeshPhone("01212345678")).toBeNull(); // 012 is not a valid BD mobile prefix
  });

  it("rejects too-short numbers", () => {
    expect(normalizeBangladeshPhone("0171234")).toBeNull();
  });

  it("rejects too-long numbers", () => {
    expect(normalizeBangladeshPhone("017123456789999")).toBeNull();
  });

  it("rejects non-numeric garbage", () => {
    expect(normalizeBangladeshPhone("not-a-phone-number")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeBangladeshPhone("")).toBeNull();
  });

  it("rejects a landline-shaped / non-mobile number", () => {
    expect(normalizeBangladeshPhone("0221234567")).toBeNull();
  });
});

describe("isValidBangladeshPhone", () => {
  it("agrees with normalizeBangladeshPhone", () => {
    expect(isValidBangladeshPhone("01712345678")).toBe(true);
    expect(isValidBangladeshPhone("not-a-phone")).toBe(false);
  });
});

describe("maskPhone", () => {
  it("masks the middle of a canonical phone number", () => {
    const masked = maskPhone("+8801712345678");
    expect(masked.startsWith("+88017")).toBe(true);
    expect(masked.endsWith("678")).toBe(true);
    expect(masked).toContain("*");
    expect(masked).not.toContain("2345");
  });
});
