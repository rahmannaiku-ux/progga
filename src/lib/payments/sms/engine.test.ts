import { describe, expect, it } from "vitest";
import { assessTransaction, type ConfigInfo } from "./risk";
import { decideMatch, type PaymentCandidate } from "./matching";
import { canTransitionPayment, canTransitionTransaction } from "./state-machine";
import { checkRequestTimestamp, generateRegistrationCode, isValidRequestId, normalizeRegistrationCode } from "./device-auth";
import type { NormalizedTransaction } from "./types";

const NOW = Date.UTC(2026, 8, 21, 4, 30);
const cfg: ConfigInfo = { version: 3, enabled: true, isLatest: true, transactionIdFormats: ["[A-Z0-9]{8,12}"], maxTransactionAgeMinutes: 1440 };
const tx = (o: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  provider: "BKASH",
  transactionId: "SYN12345AB",
  amountMinor: 50000,
  senderNumber: "01712345678",
  receiverNumber: "01500000000",
  transactionTime: new Date(NOW - 10 * 60_000).toISOString(),
  messageHash: "a".repeat(64),
  providerRuleVersion: 3,
  localReceivedAt: new Date(NOW - 9 * 60_000).toISOString(),
  ...o,
});
const claim = { authenticity: "LIKELY_AUTHENTIC" };
const risk = (t = tx(), c: ConfigInfo | null = cfg, d: any = claim) => assessTransaction({ tx: t, config: c, deviceAssessment: d, nowMs: NOW });

const payment = (o: Partial<PaymentCandidate> = {}): PaymentCandidate => ({
  id: "pay1",
  status: "AWAITING_VERIFICATION",
  mfsProvider: "BKASH",
  receivingNumber: "01500000000",
  amountMinor: 50000,
  hintedTransactionId: "SYN12345AB",
  payerPhone: null,
  createdAtMs: NOW - 60 * 60_000,
  expiresAtMs: NOW + 60 * 60_000,
  ...o,
});
const decide = (o: { t?: NormalizedTransaction; c?: PaymentCandidate[]; mode?: "OFF" | "SHADOW" | "ENFORCE"; kill?: boolean; r?: ReturnType<typeof risk>; already?: string | null } = {}) =>
  decideMatch({
    tx: o.t ?? tx(),
    risk: o.r ?? risk(o.t ?? tx()),
    candidates: o.c ?? [payment()],
    nowMs: NOW,
    mode: o.mode ?? "ENFORCE",
    autoVerifyEnabled: o.kill ?? true,
    alreadyMatchedPaymentId: o.already ?? null,
  });

describe("risk assessment", () => {
  it("a clean transaction has no hard failures and reaches trust level 2", () => {
    const r = risk();
    expect(r.hardFailures).toEqual([]);
    expect(r.trustLevel).toBe(2);
    expect(r.riskLevel).toBe("LOW");
  });
  it("unknown / disabled config, bad TrxID, stale timestamp are HARD failures", () => {
    expect(risk(tx(), null).hardFailures).toContain("CONFIG_VERSION_UNKNOWN");
    expect(risk(tx(), { ...cfg, enabled: false }).hardFailures).toContain("CONFIG_DISABLED");
    expect(risk(tx({ transactionId: "ab" })).hardFailures).toContain("TXID_INVALID_FORMAT");
    expect(risk(tx({ transactionTime: new Date(NOW - 3 * 86400_000).toISOString() })).hardFailures).toContain("TRANSACTION_TOO_OLD");
    expect(risk(tx({ transactionTime: new Date(NOW + 3600_000).toISOString() })).hardFailures).toContain("TIMESTAMP_IN_FUTURE");
  });
  it("a device-flagged SUSPICIOUS message is a hard failure at CRITICAL", () => {
    const r = risk(tx(), cfg, { authenticity: "SUSPICIOUS" });
    expect(r.hardFailures).toContain("DEVICE_FLAGGED_SUSPICIOUS");
    expect(r.riskLevel).toBe("CRITICAL");
    expect(r.trustLevel).toBe(0);
  });
  it("soft signals raise the score but are not hard failures", () => {
    const r = risk(tx({ receiverNumber: null, transactionTime: null }), { ...cfg, isLatest: false });
    expect(r.hardFailures).toEqual([]);
    expect(r.riskScore).toBe(15 + 10 + 10);
  });
  it("missing device assessment is not trusted", () => {
    const r = risk(tx(), cfg, null);
    expect(r.trustLevel).toBe(0);
    expect(r.reasonCodes).toContain("DEVICE_ASSESSMENT_MISSING");
  });
});

describe("matching engine", () => {
  it("full match in ENFORCE mode with kill switch on verifies", () => {
    const d = decide();
    expect(d.outcome).toBe("MATCHED");
    expect(d.action).toBe("VERIFY");
    expect(d.paymentId).toBe("pay1");
  });
  it("SHADOW mode records the match but never acts", () => {
    const d = decide({ mode: "SHADOW" });
    expect(d.outcome).toBe("MATCHED");
    expect(d.action).toBe("RECORD_ONLY");
    expect(d.reasons).toContain("MODE_SHADOW");
  });
  it("the pre-existing kill switch still blocks automatic verification", () => {
    const d = decide({ kill: false });
    expect(d.action).toBe("RECORD_ONLY");
    expect(d.reasons).toContain("AUTO_VERIFY_KILL_SWITCH_OFF");
  });
  it("never matches with no student hint (amount alone is not enough)", () => {
    const d = decide({ c: [] });
    expect(d.outcome).toBe("NO_CANDIDATE");
    expect(d.action).toBe("NONE");
  });
  it("wrong amount, wrong receiver, wrong provider, payer mismatch -> MISMATCH, never verify", () => {
    expect(decide({ c: [payment({ amountMinor: 60000 })] }).reasons).toContain("WRONG_AMOUNT");
    expect(decide({ c: [payment({ receivingNumber: "01511111111" })] }).reasons).toContain("WRONG_RECEIVER");
    expect(decide({ c: [payment({ mfsProvider: "NAGAD" })] }).reasons).toContain("WRONG_PROVIDER");
    expect(decide({ c: [payment({ payerPhone: "01799999999" })] }).reasons).toContain("PAYER_MISMATCH");
    for (const c of [payment({ amountMinor: 60000 }), payment({ receivingNumber: "01511111111" }), payment({ mfsProvider: "NAGAD" })]) {
      const d = decide({ c: [c] });
      expect(d.outcome).toBe("MISMATCH");
      expect(d.action).toBe("NONE");
    }
  });
  it("hint that differs from the transaction id is a mismatch", () => {
    expect(decide({ c: [payment({ hintedTransactionId: "OTHER12345" })] }).outcome).toBe("MISMATCH");
  });
  it("old transaction (before the order) and post-window transaction are held", () => {
    const old = tx({ transactionTime: new Date(NOW - 5 * 3600_000).toISOString(), localReceivedAt: new Date(NOW - 5 * 3600_000).toISOString() });
    expect(decide({ t: old }).reasons).toContain("TRANSACTION_BEFORE_ORDER");
    const late = decide({ c: [payment({ expiresAtMs: NOW - 3 * 3600_000 })] });
    expect(late.reasons).toContain("TRANSACTION_AFTER_WINDOW");
  });
  it("payment already terminal (PAID/REJECTED/EXPIRED) cannot be matched", () => {
    for (const status of ["PAID", "REJECTED", "EXPIRED", "CANCELLED", "PENDING"] as const) {
      const d = decide({ c: [payment({ status })] });
      expect(d.outcome).toBe("MISMATCH");
      expect(d.action).toBe("NONE");
    }
  });
  it("multiple candidates are AMBIGUOUS and unresolved", () => {
    const d = decide({ c: [payment(), payment({ id: "pay2" })] });
    expect(d.outcome).toBe("AMBIGUOUS");
    expect(d.action).toBe("NONE");
  });
  it("an already-matched transaction is BLOCKED (transaction belongs to another payment)", () => {
    const d = decide({ already: "other" });
    expect(d.outcome).toBe("BLOCKED");
    expect(d.reasons).toContain("TRANSACTION_ALREADY_MATCHED");
  });
  it("a hard failure can never be rescued by anything else", () => {
    const bad = tx({ transactionId: "ab" });
    const d = decide({ t: bad, r: risk(bad) });
    expect(d.outcome).toBe("BLOCKED");
    expect(d.action).toBe("NONE");
  });
  it("risk above the auto-verify limit downgrades VERIFY to RECORD_ONLY", () => {
    const t = tx({ receiverNumber: null, transactionTime: null });
    const r = assessTransaction({ tx: t, config: { ...cfg, isLatest: false }, deviceAssessment: claim, nowMs: NOW });
    expect(r.riskScore).toBeGreaterThan(30);
    const d = decide({ t, r });
    expect(d.outcome).toBe("MATCHED");
    expect(d.action).toBe("RECORD_ONLY");
  });
  it("receiver absent from the message is recorded as null, not silently a match", () => {
    const t = tx({ receiverNumber: null });
    const d = decide({ t, r: risk(t) });
    expect(d.checks.receiver).toBeNull();
    expect(d.outcome).toBe("MATCHED");
  });
});

describe("state machines", () => {
  it("payments only reach PAID from AWAITING_VERIFICATION", () => {
    expect(canTransitionPayment("AWAITING_VERIFICATION", "PAID")).toBe(true);
    for (const from of ["PENDING", "REJECTED", "EXPIRED", "CANCELLED", "PAID"] as const) {
      expect(canTransitionPayment(from, "PAID")).toBe(false);
    }
  });
  it("terminal payment states have no exits", () => {
    for (const s of ["PAID", "REJECTED", "EXPIRED", "CANCELLED"] as const) {
      for (const t of ["PENDING", "AWAITING_VERIFICATION", "PAID", "REJECTED", "EXPIRED", "CANCELLED"] as const) {
        expect(canTransitionPayment(s, t)).toBe(false);
      }
    }
  });
  it("OBSERVED is not VERIFIED: a transaction must be MATCHED first", () => {
    expect(canTransitionTransaction("OBSERVED", "VERIFIED")).toBe(false);
    expect(canTransitionTransaction("MATCHED", "VERIFIED")).toBe(true);
    expect(canTransitionTransaction("SUSPICIOUS", "VERIFIED")).toBe(false);
    expect(canTransitionTransaction("VERIFIED", "REJECTED")).toBe(false);
  });
});

describe("device request authentication helpers", () => {
  it("timestamp window rejects stale, future and malformed values", () => {
    expect(checkRequestTimestamp(String(NOW), NOW).ok).toBe(true);
    expect(checkRequestTimestamp(String(NOW - 6 * 60_000), NOW)).toEqual({ ok: false, reason: "TOO_OLD" });
    expect(checkRequestTimestamp(String(NOW + 6 * 60_000), NOW)).toEqual({ ok: false, reason: "TOO_NEW" });
    expect(checkRequestTimestamp("abc", NOW)).toEqual({ ok: false, reason: "INVALID" });
    expect(checkRequestTimestamp(null, NOW)).toEqual({ ok: false, reason: "INVALID" });
  });
  it("request ids must be opaque 16-64 char tokens", () => {
    expect(isValidRequestId("3f9c1e6a-2b7d-4c1a-9e55-0a1b2c3d4e5f")).toBe(true);
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("has spaces in it 1234567890")).toBe(false);
  });
  it("registration codes are typable and normalize", () => {
    const c = generateRegistrationCode();
    expect(c).toMatch(/^PGD-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeRegistrationCode(` ${c.toLowerCase()} `)).toBe(c);
  });
});
