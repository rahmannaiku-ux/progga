/**
 * Pure (Prisma-free) types shared by the SMS payment pipeline. String unions
 * deliberately mirror the Prisma enums so this folder can be unit-tested
 * without a generated client, and so the same vocabulary is mirrored 1:1 in
 * the Android app (apps/payment-android).
 */

export const MFS_PROVIDERS = ["BKASH", "NAGAD", "ROCKET", "UPAY"] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Local (on-device) assessment vocabulary. These are OBSERVATIONS, never
 * proof: an SMS cannot be cryptographically tied to the provider, so
 * AUTHENTIC is reserved for a future signed/API-backed source and is never
 * produced by SMS parsing alone. LIKELY_AUTHENTIC is the ceiling for SMS.
 */
export type Authenticity = "AUTHENTIC" | "LIKELY_AUTHENTIC" | "UNVERIFIED" | "SUSPICIOUS" | "REJECTED";

export type TransactionVerificationStatus =
  | "OBSERVED"
  | "PARSING_FAILED"
  | "SUSPICIOUS"
  | "UNVERIFIED"
  | "MATCHED"
  | "VERIFIED"
  | "REJECTED"
  | "DUPLICATE";

export type PaymentStatus = "PENDING" | "AWAITING_VERIFICATION" | "PAID" | "REJECTED" | "EXPIRED" | "CANCELLED";

export type SmsAutoVerifyMode = "OFF" | "SHADOW" | "ENFORCE";

/** Trust ladder (spec §17). SMS-sourced evidence can never exceed level 4. */
export type TrustLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** What the Android app uploads: normalized fields only, never the SMS body. */
export interface NormalizedTransaction {
  provider: MfsProvider;
  transactionId: string;
  /** Exact minor units (poisha). */
  amountMinor: number;
  senderNumber: string | null;
  receiverNumber: string | null;
  /** ISO-8601 instant, or null when the SMS carried no parsable time. */
  transactionTime: string | null;
  /** SHA-256 hex of the SMS body. */
  messageHash: string;
  providerRuleVersion: number;
  /** ISO-8601 instant the phone received the SMS. */
  localReceivedAt: string;
}

export interface SmsVerificationResult {
  provider: MfsProvider | null;
  senderValid: boolean;
  structureValid: boolean;
  transactionIdValid: boolean;
  amountValid: boolean;
  /** null = the message does not contain a receiver to check. */
  receiverValid: boolean | null;
  /** null = the message carried no timestamp. */
  timestampValid: boolean | null;
  /** 0..1, a local heuristic only. */
  confidence: number;
  riskLevel: RiskLevel;
  authenticity: Authenticity;
  reasonCodes: string[];
  providerRuleVersion: number | null;
}
