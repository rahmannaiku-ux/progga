import { normalizeMsisdn } from "./amount";
import { AUTO_VERIFY_MAX_RISK_SCORE, type RiskAssessment } from "./risk";
import type { MfsProvider, NormalizedTransaction, PaymentStatus, SmsAutoVerifyMode } from "./types";

/**
 * Pure decision function of the server-side matching engine. It never touches
 * the database; the service loads candidates, calls this, then applies the
 * result inside a transaction. The student-entered TrxID is only a HINT used
 * to pick candidates — every field is re-verified here, and a transaction is
 * never matched on amount alone.
 */

/** Grace before the order's creation time (clock skew between phone/server/provider) and after its expiry. */
export const WINDOW_BEFORE_ORDER_MS = 5 * 60 * 1000;
export const WINDOW_AFTER_EXPIRY_MS = 30 * 60 * 1000;

export interface PaymentCandidate {
  id: string;
  status: PaymentStatus;
  mfsProvider: MfsProvider | null;
  receivingNumber: string | null;
  amountMinor: number;
  /** Student-entered TrxID (Payment.transactionId) — a hint, not proof. */
  hintedTransactionId: string | null;
  /** Number the student said they paid from, if given. */
  payerPhone: string | null;
  createdAtMs: number;
  expiresAtMs: number | null;
}

export type MatchOutcome =
  /** Nothing to match against yet (no order carries this TrxID hint). Transaction stays OBSERVED. */
  | "NO_CANDIDATE"
  /** All checks pass. Whether that verifies the payment depends on `action`. */
  | "MATCHED"
  /** A candidate exists but a check failed — needs a human; never auto-verify. */
  | "MISMATCH"
  /** More than one candidate — unresolved. */
  | "AMBIGUOUS"
  /** Hard failure or already used — isolated. */
  | "BLOCKED";

export type MatchAction =
  | "NONE" // nothing to do
  | "VERIFY" // mode ENFORCE + kill-switch on + all clear: verify & enroll
  | "RECORD_ONLY"; // matched but not acted on (SHADOW mode / kill switch off / risk too high)

export interface MatchDecision {
  outcome: MatchOutcome;
  action: MatchAction;
  paymentId: string | null;
  reasons: string[];
  /** Per-check results for the audit log. */
  checks: Record<string, boolean | null>;
}

export interface MatchInput {
  tx: NormalizedTransaction;
  risk: RiskAssessment;
  candidates: PaymentCandidate[];
  nowMs: number;
  mode: SmsAutoVerifyMode;
  /** SiteSettings.autoVerifyPayments — the pre-existing admin kill switch. */
  autoVerifyEnabled: boolean;
  /** Payment already bound to this exact transaction (a replay/duplicate). */
  alreadyMatchedPaymentId: string | null;
}

export function decideMatch(input: MatchInput): MatchDecision {
  const { tx, risk, candidates, nowMs, mode, autoVerifyEnabled, alreadyMatchedPaymentId } = input;
  const checks: Record<string, boolean | null> = {};
  const reasons: string[] = [];
  const blocked = (rs: string[]): MatchDecision => ({ outcome: "BLOCKED", action: "NONE", paymentId: null, reasons: rs, checks });

  if (risk.hardFailures.length > 0) return blocked(risk.hardFailures);
  if (alreadyMatchedPaymentId) return blocked(["TRANSACTION_ALREADY_MATCHED"]);

  if (candidates.length === 0) return { outcome: "NO_CANDIDATE", action: "NONE", paymentId: null, reasons: ["NO_PAYMENT_HINT"], checks };
  if (candidates.length > 1) return { outcome: "AMBIGUOUS", action: "NONE", paymentId: null, reasons: ["MULTIPLE_CANDIDATES"], checks };

  const p = candidates[0]!;
  const fail = (code: string) => reasons.push(code);

  checks.hintMatches = p.hintedTransactionId !== null && p.hintedTransactionId.toUpperCase() === tx.transactionId.toUpperCase();
  if (!checks.hintMatches) fail("HINT_MISMATCH");

  checks.statusOpen = p.status === "AWAITING_VERIFICATION";
  if (!checks.statusOpen) fail(`PAYMENT_NOT_AWAITING_VERIFICATION:${p.status}`);

  checks.provider = p.mfsProvider !== null && p.mfsProvider === tx.provider;
  if (!checks.provider) fail("WRONG_PROVIDER");

  checks.amount = p.amountMinor === tx.amountMinor;
  if (!checks.amount) fail("WRONG_AMOUNT");

  if (tx.receiverNumber === null) {
    // The SMS names no receiver; the device attests the SIM. Recorded, not silently treated as a match.
    checks.receiver = null;
  } else {
    const want = normalizeMsisdn(p.receivingNumber);
    checks.receiver = want !== null && want === normalizeMsisdn(tx.receiverNumber);
    if (!checks.receiver) fail("WRONG_RECEIVER");
  }

  const when = tx.transactionTime !== null ? Date.parse(tx.transactionTime) : Date.parse(tx.localReceivedAt);
  const usedFallbackTime = tx.transactionTime === null;
  const lower = p.createdAtMs - WINDOW_BEFORE_ORDER_MS;
  const upper = (p.expiresAtMs ?? Number.POSITIVE_INFINITY) + WINDOW_AFTER_EXPIRY_MS;
  checks.timeWindow = !Number.isNaN(when) && when >= lower && when <= upper;
  if (!checks.timeWindow) fail(when < lower ? "TRANSACTION_BEFORE_ORDER" : "TRANSACTION_AFTER_WINDOW");
  if (usedFallbackTime) reasons.push("TIME_FROM_DEVICE_RECEIPT");

  const payer = normalizeMsisdn(p.payerPhone);
  if (payer !== null) {
    const sender = normalizeMsisdn(tx.senderNumber);
    checks.payer = sender !== null && sender === payer;
    if (!checks.payer) fail("PAYER_MISMATCH");
  } else checks.payer = null;

  const failing = Object.entries(checks).some(([, v]) => v === false);
  if (failing) return { outcome: "MISMATCH", action: "NONE", paymentId: p.id, reasons, checks };

  // Everything checked out. Decide whether we ACT on it.
  const riskOk = risk.riskScore <= AUTO_VERIFY_MAX_RISK_SCORE;
  if (!riskOk) reasons.push("RISK_SCORE_ABOVE_AUTO_VERIFY_LIMIT");
  if (mode !== "ENFORCE") reasons.push(`MODE_${mode}`);
  if (!autoVerifyEnabled) reasons.push("AUTO_VERIFY_KILL_SWITCH_OFF");

  const act = mode === "ENFORCE" && autoVerifyEnabled && riskOk;
  return { outcome: "MATCHED", action: act ? "VERIFY" : "RECORD_ONLY", paymentId: p.id, reasons, checks };
}
