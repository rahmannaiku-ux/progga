import { parseAmountToMinor } from "./amount";
import type { NormalizedTransaction, RiskLevel, TrustLevel } from "./types";

/**
 * Server-side validation + risk scoring of a device-uploaded transaction.
 *
 * Two deliberately separate outputs:
 *  - hardFailures: security invariants. ANY hard failure means the
 *    transaction can never be MATCHED/VERIFIED automatically, regardless of score.
 *  - riskScore: an additive heuristic for admin triage and for gating
 *    auto-verification of *otherwise valid* transactions. It can only make
 *    things stricter — never rescue a hard failure.
 */

export const AUTO_VERIFY_MAX_RISK_SCORE = 30;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
/** A message can be delivered late; beyond this gap between the SMS timestamp and phone receipt it's worth flagging. */
const DELIVERY_DELAY_MS = 30 * 60 * 1000;

export interface ConfigInfo {
  version: number;
  enabled: boolean;
  /** true when `version` is the newest effective version for this provider */
  isLatest: boolean;
  /** Source strings of every transactionIdFormat in that version's parser rules. */
  transactionIdFormats: string[];
  maxTransactionAgeMinutes: number;
}

export interface DeviceAssessmentClaim {
  authenticity?: string;
  reasonCodes?: string[];
  senderValid?: boolean;
  structureValid?: boolean;
}

export interface RiskInput {
  tx: NormalizedTransaction;
  /** null when (provider, version) is unknown to the server. */
  config: ConfigInfo | null;
  deviceAssessment?: DeviceAssessmentClaim | null;
  nowMs: number;
}

export interface RiskAssessment {
  hardFailures: string[];
  /** Soft signals that raised the score. */
  signals: { code: string; points: number }[];
  /** Checks that passed (audit trail only; they don't lower the score). */
  positives: string[];
  riskScore: number;
  riskLevel: RiskLevel;
  trustLevel: TrustLevel;
  /** Everything above as a flat list of reason codes for storage. */
  reasonCodes: string[];
}

function matchesFullString(pattern: string, value: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return false;
  }
}

export function assessTransaction(input: RiskInput): RiskAssessment {
  const { tx, config, deviceAssessment, nowMs } = input;
  const hard: string[] = [];
  const signals: { code: string; points: number }[] = [];
  const positives: string[] = [];
  const soft = (code: string, points: number) => signals.push({ code, points });

  // --- configuration provenance ---
  if (!config) hard.push("CONFIG_VERSION_UNKNOWN");
  else {
    if (!config.enabled) hard.push("CONFIG_DISABLED");
    else positives.push("CONFIG_VALID");
    if (!config.isLatest) soft("CONFIG_VERSION_STALE", 15);
  }

  // --- field validity ---
  if (config && config.transactionIdFormats.length > 0) {
    if (config.transactionIdFormats.some((f) => matchesFullString(f, tx.transactionId))) positives.push("TXID_FORMAT_VALID");
    else hard.push("TXID_INVALID_FORMAT");
  } else if (config) {
    hard.push("TXID_FORMAT_UNCONFIGURED");
  }
  if (!Number.isInteger(tx.amountMinor) || parseAmountToMinor((tx.amountMinor / 100).toFixed(2)) !== tx.amountMinor) {
    hard.push("AMOUNT_INVALID");
  } else positives.push("AMOUNT_VALID");

  // --- timestamps ---
  const localMs = Date.parse(tx.localReceivedAt);
  if (Number.isNaN(localMs)) hard.push("LOCAL_TIME_INVALID");
  else if (localMs > nowMs + FUTURE_SKEW_MS) hard.push("LOCAL_TIME_IN_FUTURE");

  if (tx.transactionTime === null) {
    soft("TIMESTAMP_NOT_IN_MESSAGE", 10);
  } else {
    const t = Date.parse(tx.transactionTime);
    if (Number.isNaN(t)) hard.push("TIMESTAMP_INVALID");
    else if (t > nowMs + FUTURE_SKEW_MS) hard.push("TIMESTAMP_IN_FUTURE");
    else if (config && nowMs - t > config.maxTransactionAgeMinutes * 60_000) hard.push("TRANSACTION_TOO_OLD");
    else {
      positives.push("TIMESTAMP_VALID");
      if (!Number.isNaN(localMs) && Math.abs(localMs - t) > DELIVERY_DELAY_MS) soft("DELIVERY_DELAY_LARGE", 10);
    }
  }

  if (tx.receiverNumber === null) soft("RECEIVER_NOT_IN_MESSAGE", 10);
  else positives.push("RECEIVER_PRESENT");

  // --- what the device told us about its own local analysis (claims, not facts) ---
  const auth = deviceAssessment?.authenticity;
  if (auth === "SUSPICIOUS" || auth === "REJECTED") hard.push(`DEVICE_FLAGGED_${auth}`);
  else if (auth === "UNVERIFIED") soft("DEVICE_UNVERIFIED", 25);
  else if (auth === "LIKELY_AUTHENTIC" || auth === "AUTHENTIC") positives.push("DEVICE_SENDER_AND_STRUCTURE_OK");
  else soft("DEVICE_ASSESSMENT_MISSING", 25);

  const riskScore = Math.min(100, signals.reduce((s, x) => s + x.points, 0));
  let riskLevel: RiskLevel = riskScore < 20 ? "LOW" : riskScore < 50 ? "MEDIUM" : "HIGH";
  if (hard.length > 0) riskLevel = hard.some((h) => h === "CONFIG_VERSION_UNKNOWN" || h.startsWith("DEVICE_FLAGGED")) ? "CRITICAL" : "HIGH";

  let trustLevel: TrustLevel = 0;
  const deviceOk = auth === "LIKELY_AUTHENTIC" || auth === "AUTHENTIC";
  if (deviceOk && config && config.enabled) trustLevel = 1;
  if (hard.length === 0 && trustLevel >= 1) trustLevel = 2;

  return {
    hardFailures: hard,
    signals,
    positives,
    riskScore,
    riskLevel,
    trustLevel,
    reasonCodes: [...hard, ...signals.map((s) => s.code)],
  };
}
