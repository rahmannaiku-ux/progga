import { describe, expect, it } from "vitest";
import { invoiceUrlFor, publicSiteUrl, purchaseSuccessMessage } from "./messages";

describe("publicSiteUrl", () => {
  it("uses the configured app URL without a trailing slash", () => {
    expect(publicSiteUrl("https://example.com/")).toBe("https://example.com");
  });
  it("never hands out a localhost link", () => {
    expect(publicSiteUrl("http://localhost:3000")).toBe("https://progga-zeta.vercel.app");
    expect(publicSiteUrl(undefined)).toBe("https://progga-zeta.vercel.app");
  });
});

describe("purchaseSuccessMessage", () => {
  const base = {
    studentName: "Rafi",
    courseTitle: "Physics 101",
    amountCents: 150000,
    currency: "BDT",
    reference: "PRG-8F42K7",
  };

  it("includes the invoice link", () => {
    const msg = purchaseSuccessMessage({ ...base, invoiceUrl: invoiceUrlFor("pay_1", "https://progga-zeta.vercel.app") });
    expect(msg).toContain("Invoice: https://progga-zeta.vercel.app/payments/pay_1/invoice");
    expect(msg).toContain("Paid: BDT 1,500");
  });

  it("omits the invoice part when no link is given", () => {
    expect(purchaseSuccessMessage(base)).not.toContain("Invoice:");
  });
});
