import type { VerificationMethod } from "@prisma/client";
import type { MfsProvider } from "@/lib/payments/sms/types";
import { MFS_PROVIDER_META } from "@/lib/payments/format";

/**
 * Pure invoice model for a PAID Payment — everything the invoice page
 * (and its printed/PDF form) shows is derived here so the arithmetic is
 * testable without a database.
 *
 * Amounts: `amountCents` is what was actually charged. A coupon's
 * `couponDiscountCents` is a snapshot of what it took off, so the
 * pre-coupon price is `amountCents + couponDiscountCents` — the same
 * derivation the purchase-success SMS uses (payment-verification.ts).
 */
export interface InvoicePaymentInput {
  paymentReference: string;
  amountCents: number;
  couponCode: string | null;
  couponDiscountCents: number | null;
  transactionId: string | null;
  mfsProvider: MfsProvider | null;
  verificationMethod: VerificationMethod | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface Invoice {
  number: string;
  issuedAt: Date;
  subtotalCents: number;
  discountCents: number;
  couponCode: string | null;
  totalCents: number;
  paymentMethod: string;
  transactionId: string | null;
}

/** "PRG-8F42K7" -> "INV-8F42K7". Tolerates references without the prefix. */
export function invoiceNumber(paymentReference: string): string {
  return `INV-${paymentReference.replace(/^PRG-/, "")}`;
}

export function buildInvoice(p: InvoicePaymentInput): Invoice {
  const totalCents = Math.max(0, p.amountCents);
  const discountCents = Math.max(0, p.couponDiscountCents ?? 0);
  const isFreeCoupon = p.verificationMethod === "FULL_DISCOUNT_COUPON" || (totalCents === 0 && discountCents > 0);

  return {
    number: invoiceNumber(p.paymentReference),
    issuedAt: p.verifiedAt ?? p.createdAt,
    subtotalCents: totalCents + discountCents,
    discountCents,
    couponCode: discountCents > 0 ? p.couponCode : null,
    totalCents,
    // A 100%-off coupon order never went through an MFS — nothing was
    // sent, so claiming "bKash" (the snapshotted default) would be false.
    paymentMethod: isFreeCoupon
      ? "Coupon (no payment required)"
      : MFS_PROVIDER_META[p.mfsProvider ?? "BKASH"].displayName,
    transactionId: isFreeCoupon ? null : p.transactionId,
  };
}

/** Invoice-style money: always two decimals, e.g. "৳1,500.00". */
export function formatInvoiceMoney(cents: number): string {
  return `৳${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
