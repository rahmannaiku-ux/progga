import { describe, expect, it } from "vitest";
import { invoiceUrlFor, purchaseSuccessMessage } from "./messages";

describe("invoiceUrlFor", () => {
  it("links to the invoice on the canonical domain by default", () => {
    expect(invoiceUrlFor("pay_1", "https://prooggaa.com")).toBe("https://prooggaa.com/payments/pay_1/invoice");
    expect(invoiceUrlFor("a/b?c")).toMatch(/\/payments\/a%2Fb%3Fc\/invoice$/);
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
    const msg = purchaseSuccessMessage({ ...base, invoiceUrl: invoiceUrlFor("pay_1", "https://prooggaa.com") });
    expect(msg).toContain("Invoice: https://prooggaa.com/payments/pay_1/invoice");
    expect(msg).toContain("Paid: BDT 1,500");
  });

  it("omits the invoice part when no link is given", () => {
    expect(purchaseSuccessMessage(base)).not.toContain("Invoice:");
  });
});
