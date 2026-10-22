import { describe, it, expect } from "vitest";
import { decisionBlock, parsePaymentNumberPayload, parseReason } from "./sensitive-requests";

describe("parsePaymentNumberPayload", () => {
  it("accepts a known provider and a Bangladeshi mobile number in any common format", () => {
    expect(parsePaymentNumberPayload({ provider: "BKASH", receivingNumber: "+880 1712-345678" })).toEqual({
      ok: true,
      value: { provider: "BKASH", receivingNumber: "01712345678", displayName: "BKASH", enabled: true },
    });
  });

  it("refuses an unknown provider or a bad number", () => {
    expect(parsePaymentNumberPayload({ provider: "PAYPAL", receivingNumber: "01712345678" }).ok).toBe(false);
    expect(parsePaymentNumberPayload({ provider: "NAGAD", receivingNumber: "0171234" }).ok).toBe(false);
  });
});

describe("parseReason", () => {
  it("needs a real reason", () => {
    expect(parseReason("too short").ok).toBe(false);
    expect(parseReason("  New bKash SIM after the old one was lost  ")).toEqual({
      ok: true,
      value: "New bKash SIM after the old one was lost",
    });
    expect(parseReason("x".repeat(501)).ok).toBe(false);
  });
});

describe("decisionBlock", () => {
  const pending = { status: "PENDING", requestedById: "asker" };

  it("only a super admin other than the asker decides", () => {
    expect(decisionBlock({ id: "boss", role: "SUPER_ADMIN" }, pending)).toBeNull();
    expect(decisionBlock({ id: "other", role: "ADMIN" }, pending)).toMatch(/super admin/);
    expect(decisionBlock({ id: "asker", role: "SUPER_ADMIN" }, pending)).toMatch(/Someone else/);
  });

  it("a decided request stays decided", () => {
    expect(decisionBlock({ id: "boss", role: "SUPER_ADMIN" }, { ...pending, status: "APPROVED" })).toMatch(/already/);
  });
});
