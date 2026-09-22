import { describe, expect, it } from "vitest";
import { formatMoney, MFS_PROVIDER_META, maskReceivingNumber } from "./format";

describe("formatMoney", () => {
  it("renders BDT with the ৳ glyph and no decimals for whole taka", () => {
    expect(formatMoney(50000, "BDT")).toBe("৳500");
  });
  it("renders BDT with up to 2 decimals when the amount isn't whole", () => {
    expect(formatMoney(50050, "BDT")).toBe("৳500.5");
  });
  it("falls back to Intl currency formatting for non-BDT currencies", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
  });
});

describe("MFS_PROVIDER_META", () => {
  it("has display metadata for all four supported providers", () => {
    expect(Object.keys(MFS_PROVIDER_META).sort()).toEqual(["BKASH", "NAGAD", "ROCKET", "UPAY"]);
  });
  it("never leaves a display name empty", () => {
    for (const meta of Object.values(MFS_PROVIDER_META)) {
      expect(meta.displayName.length).toBeGreaterThan(0);
      expect(meta.appName.length).toBeGreaterThan(0);
    }
  });
});

describe("maskReceivingNumber", () => {
  it("masks the middle digits of a Bangladeshi mobile number", () => {
    expect(maskReceivingNumber("01712345678")).toBe("017•••••678");
  });
  it("leaves a too-short value alone rather than guessing", () => {
    expect(maskReceivingNumber("12345")).toBe("12345");
  });
  it("returns an em dash for null/undefined", () => {
    expect(maskReceivingNumber(null)).toBe("—");
    expect(maskReceivingNumber(undefined)).toBe("—");
  });
});
