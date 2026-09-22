import type { PaymentStatus, TransactionVerificationStatus } from "./types";

/**
 * Explicit transition tables. PaymentStatus is the *existing* Proggaa order
 * lifecycle (see the mapping in docs/payment-automation.md); the transaction
 * table is the separate lifecycle of an observed SMS transaction. "Observed"
 * never implies "paid".
 */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["AWAITING_VERIFICATION", "EXPIRED", "CANCELLED"],
  AWAITING_VERIFICATION: ["PAID", "REJECTED", "CANCELLED"],
  PAID: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const TRANSACTION_TRANSITIONS: Record<TransactionVerificationStatus, readonly TransactionVerificationStatus[]> = {
  OBSERVED: ["MATCHED", "SUSPICIOUS", "UNVERIFIED", "REJECTED"],
  UNVERIFIED: ["OBSERVED", "MATCHED", "SUSPICIOUS", "REJECTED"],
  SUSPICIOUS: ["MATCHED", "REJECTED"], // MATCHED only via an audited admin resolution
  MATCHED: ["VERIFIED", "SUSPICIOUS", "REJECTED"],
  PARSING_FAILED: ["REJECTED"],
  VERIFIED: [],
  REJECTED: [],
  DUPLICATE: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionTransaction(from: TransactionVerificationStatus, to: TransactionVerificationStatus): boolean {
  return TRANSACTION_TRANSITIONS[from].includes(to);
}
