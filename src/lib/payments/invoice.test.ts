import { describe, expect, it } from "vitest";
import { buildInvoice, formatInvoiceMoney, invoiceNumber, type InvoicePaymentInput } from "./invoice";

const base: InvoicePaymentInput = {
  paymentReference: "PRG-8F42K7",
  amountCents: 150000,
  couponCode: null,
  couponDiscountCents: null,
  transactionId: "BKX123",
  mfsProvider: "BKASH",
  verificationMethod: "MANUAL_ADMIN",
  verifiedAt: new Date("2026-09-01T10:00:00Z"),
  createdAt: new Date("2026-08-31T10:00:00Z"),
};

describe("invoiceNumber", () => {
  it("swaps the PRG- prefix for INV-", () => {
    expect(invoiceNumber("PRG-8F42K7")).toBe("INV-8F42K7");
  });
  it("only strips a leading prefix", () => {
    expect(invoiceNumber("ABCPRG-1")).toBe("INV-ABCPRG-1");
  });
});

describe("buildInvoice", () => {
  it("plain payment: subtotal equals total, no discount", () => {
    const inv = buildInvoice(base);
    expect(inv).toMatchObject({
      number: "INV-8F42K7",
      subtotalCents: 150000,
      discountCents: 0,
      couponCode: null,
      totalCents: 150000,
      paymentMethod: "bKash",
      transactionId: "BKX123",
    });
    expect(inv.issuedAt).toEqual(base.verifiedAt);
  });

  it("coupon payment: subtotal is the pre-coupon price", () => {
    const inv = buildInvoice({ ...base, amountCents: 120000, couponCode: "SAVE20", couponDiscountCents: 30000 });
    expect(inv.subtotalCents).toBe(150000);
    expect(inv.discountCents).toBe(30000);
    expect(inv.couponCode).toBe("SAVE20");
    expect(inv.totalCents).toBe(120000);
  });

  it("100% coupon: no MFS provider or TXID is claimed", () => {
    const inv = buildInvoice({
      ...base,
      amountCents: 0,
      couponCode: "FREE",
      couponDiscountCents: 150000,
      transactionId: null,
      verificationMethod: "FULL_DISCOUNT_COUPON",
    });
    expect(inv.paymentMethod).toBe("Coupon (no payment required)");
    expect(inv.transactionId).toBeNull();
    expect(inv.totalCents).toBe(0);
    expect(inv.subtotalCents).toBe(150000);
  });

  it("uses the order's actual provider", () => {
    expect(buildInvoice({ ...base, mfsProvider: "NAGAD" }).paymentMethod).toBe("Nagad");
  });

  it("falls back to createdAt when never stamped verified", () => {
    expect(buildInvoice({ ...base, verifiedAt: null }).issuedAt).toEqual(base.createdAt);
  });
});

describe("formatInvoiceMoney", () => {
  it("always shows two decimals with grouping", () => {
    expect(formatInvoiceMoney(150000)).toBe("৳1,500.00");
    expect(formatInvoiceMoney(1999)).toBe("৳19.99");
    expect(formatInvoiceMoney(0)).toBe("৳0.00");
  });
});
