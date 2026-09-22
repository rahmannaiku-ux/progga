import { Prisma } from "@prisma/client";
import type { PaymentBridgeDevice, PaymentTransaction } from "@prisma/client";
import { db } from "@/lib/db/client";
import { logPayment } from "@/lib/payments/log";
import { notifyPaymentAdmins } from "@/lib/payments/notify-admins";
import { formatMoney } from "@/lib/payments/format";
import { assessTransaction, type RiskAssessment } from "@/lib/payments/sms/risk";
import { decideMatch, type PaymentCandidate } from "@/lib/payments/sms/matching";
import { canTransitionTransaction } from "@/lib/payments/sms/state-machine";
import type { MfsProvider, NormalizedTransaction, SmsAutoVerifyMode, TransactionVerificationStatus } from "@/lib/payments/sms/types";
import type { DeviceTransactionPayload } from "@/lib/validation/payment-device";
import { loadConfigInfo } from "./provider-config";
import { writeAudit } from "./payment-audit";
import { markPaidAndEnroll, notifyAutomaticVerification } from "./payment-verification";

/** Same window the expire-payments cron uses for a PENDING order, used when a legacy order has no expiresAt. */
const LEGACY_ORDER_TTL_MS = 48 * 60 * 60 * 1000;

export type IngestAck = "ACK" | "REJECTED";
export interface IngestResult {
  transactionId: string;
  provider: MfsProvider;
  /** ACK => the device may delete its queue entry (server has durably decided). */
  ack: IngestAck;
  serverStatus: TransactionVerificationStatus | "DUPLICATE_CONFLICT";
  duplicate: boolean;
  paymentStatus: string | null;
  reasons: string[];
}

const j = (v: unknown) => v as Prisma.InputJsonValue;

function toNormalized(row: PaymentTransaction): NormalizedTransaction {
  return {
    provider: row.provider as MfsProvider,
    transactionId: row.transactionId,
    amountMinor: row.amountMinor,
    senderNumber: row.senderNumber,
    receiverNumber: row.receiverNumber,
    transactionTime: row.transactionTime ? row.transactionTime.toISOString() : null,
    messageHash: row.messageHash,
    providerRuleVersion: row.providerRuleVersion,
    localReceivedAt: row.localReceivedAt.toISOString(),
  };
}

/** Sets a transaction status only along legal edges (see TRANSACTION_TRANSITIONS); WHERE-guarded against concurrent changes. */
async function setTransactionStatus(
  row: Pick<PaymentTransaction, "id" | "verificationStatus">,
  to: TransactionVerificationStatus,
  data: Prisma.PaymentTransactionUpdateManyMutationInput = {}
) {
  if (row.verificationStatus === to) return true;
  if (!canTransitionTransaction(row.verificationStatus as TransactionVerificationStatus, to)) return false;
  const r = await db.paymentTransaction.updateMany({
    where: { id: row.id, verificationStatus: row.verificationStatus },
    data: { ...data, verificationStatus: to },
  });
  return r.count === 1;
}

/**
 * Ingests ONE device-reported transaction. Safe to call repeatedly with the
 * same payload (idempotent): repeats never create a second row, a second
 * match, or a second enrollment. The server — not the device — decides
 * every status returned here.
 */
export async function ingestDeviceTransaction(device: PaymentBridgeDevice, p: DeviceTransactionPayload): Promise<IngestResult> {
  const nowMs = Date.now();
  const actor = `device:${device.id}`;
  const base = { transactionId: p.transactionId, provider: p.provider };

  const config = await loadConfigInfo(p.provider, p.providerRuleVersion);
  const normalized: NormalizedTransaction = {
    provider: p.provider,
    transactionId: p.transactionId,
    amountMinor: p.amountMinor,
    senderNumber: p.senderNumber,
    receiverNumber: p.receiverNumber,
    transactionTime: p.transactionTime,
    messageHash: p.messageHash,
    providerRuleVersion: p.providerRuleVersion,
    localReceivedAt: p.localReceivedAt,
  };
  const risk = assessTransaction({ tx: normalized, config, deviceAssessment: p.assessment, nowMs });

  // ---- duplicate handling (DB unique (provider, transactionId) is the real guarantee) ----
  const existing = await db.paymentTransaction.findUnique({
    where: { provider_transactionId: { provider: p.provider, transactionId: p.transactionId } },
  });
  if (existing) return handleDuplicate(device, existing, p);

  let row: PaymentTransaction;
  try {
    row = await db.paymentTransaction.create({
      data: {
        provider: p.provider,
        transactionId: p.transactionId,
        amountMinor: p.amountMinor,
        senderNumber: p.senderNumber,
        receiverNumber: p.receiverNumber,
        transactionTime: p.transactionTime ? new Date(p.transactionTime) : null,
        messageHash: p.messageHash,
        providerRuleVersion: p.providerRuleVersion,
        localReceivedAt: new Date(p.localReceivedAt),
        deviceId: device.id,
        deviceAssessment: j(p.assessment),
        verificationStatus: risk.hardFailures.length > 0 ? "SUSPICIOUS" : "OBSERVED",
        trustLevel: risk.trustLevel,
        riskLevel: risk.riskLevel,
        riskScore: risk.riskScore,
        verificationReasons: j(risk.reasonCodes),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Lost a race with a concurrent upload of the same transaction: treat as a duplicate.
      const winner = await db.paymentTransaction.findUniqueOrThrow({
        where: { provider_transactionId: { provider: p.provider, transactionId: p.transactionId } },
      });
      return handleDuplicate(device, winner, p);
    }
    throw err;
  }

  await db.paymentBridgeDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date(), lastTransactionAt: new Date() } });
  await writeAudit({
    event: "transaction.observed",
    actor,
    transactionId: row.id,
    deviceId: device.id,
    metadata: j({
      provider: p.provider,
      providerRuleVersion: p.providerRuleVersion,
      riskScore: risk.riskScore,
      hardFailures: risk.hardFailures,
      deviceAuthenticity: p.assessment.authenticity,
      evidenceSource: "SMS_OBSERVED",
    }),
  });
  logPayment("info", "transaction.observed", { transactionRowId: row.id, deviceId: device.id, provider: p.provider, status: row.verificationStatus });

  if (risk.hardFailures.length > 0) {
    await notifyPaymentAdmins({
      title: "Suspicious payment SMS isolated",
      body: `A ${p.provider} transaction from device "${device.name}" failed validation (${risk.hardFailures.join(", ")}). It will not be auto-verified.`,
      linkUrl: "/admin/payments",
    });
    return { ...base, ack: "ACK", serverStatus: "SUSPICIOUS", duplicate: false, paymentStatus: null, reasons: risk.hardFailures };
  }

  return runMatching(row.id, risk);
}

async function handleDuplicate(device: PaymentBridgeDevice, existing: PaymentTransaction, p: DeviceTransactionPayload): Promise<IngestResult> {
  const base = { transactionId: p.transactionId, provider: p.provider };
  const same =
    existing.messageHash === p.messageHash &&
    existing.amountMinor === p.amountMinor &&
    (existing.receiverNumber ?? null) === (p.receiverNumber ?? null);

  if (same) {
    // Legit retry (e.g. the ACK was lost). Re-evaluate only if it is still undecided; never act twice.
    const status = existing.verificationStatus as TransactionVerificationStatus;
    let paymentStatus: string | null = null;
    if (status === "OBSERVED" || status === "UNVERIFIED") {
      const r = await runMatching(existing.id);
      return { ...r, duplicate: true };
    }
    if (existing.matchedPaymentId) {
      paymentStatus = (await db.payment.findUnique({ where: { id: existing.matchedPaymentId }, select: { status: true } }))?.status ?? null;
    }
    return { ...base, ack: "ACK", serverStatus: status, duplicate: true, paymentStatus, reasons: ["ALREADY_RECEIVED"] };
  }

  // Same provider+TrxID but different content: possible forgery or replay with modification. Fail closed.
  await writeAudit({
    event: "transaction.conflicting_duplicate",
    actor: `device:${device.id}`,
    transactionId: existing.id,
    deviceId: device.id,
    metadata: j({ provider: p.provider, hashDiffers: existing.messageHash !== p.messageHash, amountDiffers: existing.amountMinor !== p.amountMinor }),
  });
  if (existing.verificationStatus !== "VERIFIED" && existing.verificationStatus !== "REJECTED") {
    await db.paymentTransaction.updateMany({
      where: { id: existing.id, verificationStatus: { notIn: ["VERIFIED", "REJECTED"] } },
      data: { verificationStatus: "SUSPICIOUS", verificationReasons: j(["CONFLICTING_DUPLICATE_OBSERVATION"]), riskLevel: "CRITICAL" },
    });
  }
  await notifyPaymentAdmins({
    title: "Conflicting duplicate transaction",
    body: `Two different observations of the same ${p.provider} transaction ID were received. Review it in the suspicious queue.`,
  });
  logPayment("warn", "transaction.conflicting_duplicate", { transactionRowId: existing.id, deviceId: device.id, provider: p.provider });
  return { ...base, ack: "ACK", serverStatus: "DUPLICATE_CONFLICT", duplicate: true, paymentStatus: null, reasons: ["CONFLICTING_DUPLICATE_OBSERVATION"] };
}

async function loadCandidates(tx: PaymentTransaction): Promise<PaymentCandidate[]> {
  // The student-entered TrxID is a HINT that selects candidates; Payment.transactionId is unique, so at most one.
  const rows = await db.payment.findMany({ where: { transactionId: tx.transactionId }, take: 3 });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    mfsProvider: r.mfsProvider as MfsProvider | null,
    receivingNumber: r.receivingNumber,
    amountMinor: r.amountCents, // BDT: cents == poisha (minor units)
    hintedTransactionId: r.transactionId,
    payerPhone: r.payerPhone,
    createdAtMs: r.createdAt.getTime(),
    expiresAtMs: r.expiresAt ? r.expiresAt.getTime() : r.createdAt.getTime() + LEGACY_ORDER_TTL_MS,
  }));
}

/**
 * Runs the matching engine for a stored transaction and applies the decision.
 * Also called (a) when a student submits a TrxID after the SMS already
 * arrived, and (b) on idempotent re-uploads. Never enrolls unless
 * decideMatch says VERIFY AND markPaidAndEnroll's atomic guards agree.
 */
export async function runMatching(transactionRowId: string, precomputedRisk?: RiskAssessment): Promise<IngestResult> {
  const row = await db.paymentTransaction.findUniqueOrThrow({ where: { id: transactionRowId } });
  const base = { transactionId: row.transactionId, provider: row.provider as MfsProvider, duplicate: false };
  const status = row.verificationStatus as TransactionVerificationStatus;

  // Terminal / already-decided rows are never re-evaluated.
  if (status === "VERIFIED" || status === "REJECTED" || status === "SUSPICIOUS" || status === "MATCHED") {
    const paymentStatus = row.matchedPaymentId
      ? (await db.payment.findUnique({ where: { id: row.matchedPaymentId }, select: { status: true } }))?.status ?? null
      : null;
    return { ...base, ack: "ACK", serverStatus: status, paymentStatus, reasons: (row.verificationReasons as string[] | null) ?? [] };
  }

  const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });
  const mode = (settings?.smsAutoVerifyMode ?? "SHADOW") as SmsAutoVerifyMode;
  const autoVerifyEnabled = settings?.autoVerifyPayments ?? false;

  if (mode === "OFF") {
    return { ...base, ack: "ACK", serverStatus: status, paymentStatus: null, reasons: ["MODE_OFF"] };
  }

  // Re-derive risk from stored facts (configuration may have changed since upload; hard failures stay failures).
  const normalized = toNormalized(row);
  const config = await loadConfigInfo(normalized.provider, normalized.providerRuleVersion);
  const risk =
    precomputedRisk ??
    assessTransaction({ tx: normalized, config, deviceAssessment: (row.deviceAssessment as { authenticity?: string } | null) ?? null, nowMs: Date.now() });

  const candidates = await loadCandidates(row);
  const decision = decideMatch({
    tx: normalized,
    risk,
    candidates,
    nowMs: Date.now(),
    mode,
    autoVerifyEnabled,
    alreadyMatchedPaymentId: row.matchedPaymentId,
  });

  const reasons = decision.reasons;
  const audit = (event: string, extra: Record<string, unknown> = {}) =>
    writeAudit({
      event,
      actor: `device:${row.deviceId}`,
      transactionId: row.id,
      paymentId: decision.paymentId,
      deviceId: row.deviceId,
      metadata: j({ outcome: decision.outcome, action: decision.action, reasons, checks: decision.checks, mode, ...extra }),
    });

  switch (decision.outcome) {
    case "NO_CANDIDATE":
      return { ...base, ack: "ACK", serverStatus: status, paymentStatus: null, reasons };

    case "AMBIGUOUS": {
      await audit("match.ambiguous");
      await notifyPaymentAdmins({ title: "Ambiguous payment match", body: `A ${normalized.provider} transaction matches more than one payment. Manual review needed.` });
      return { ...base, ack: "ACK", serverStatus: status, paymentStatus: null, reasons };
    }

    case "BLOCKED": {
      await setTransactionStatus(row, "SUSPICIOUS", { verificationReasons: j(reasons), riskLevel: risk.riskLevel, riskScore: risk.riskScore });
      await audit("match.blocked");
      return { ...base, ack: "ACK", serverStatus: "SUSPICIOUS", paymentStatus: null, reasons };
    }

    case "MISMATCH": {
      const changed = await setTransactionStatus(row, "UNVERIFIED", { verificationReasons: j(reasons), decisionMode: mode });
      await audit("match.mismatch");
      if (changed && status !== "UNVERIFIED") {
        const pay = candidates[0];
        await notifyPaymentAdmins({
          title: "Payment evidence doesn't match the order",
          body: `${normalized.provider} ${formatMoney(normalized.amountMinor, "BDT")} observed for a submitted TrxID, but: ${reasons.join(", ")}. Needs manual review.`,
          linkUrl: pay ? `/admin/payments` : undefined,
        });
      }
      const paymentStatus = decision.paymentId ? candidates[0]?.status ?? null : null;
      return { ...base, ack: "ACK", serverStatus: "UNVERIFIED", paymentStatus, reasons };
    }

    case "MATCHED": {
      // Claim the transaction for exactly one payment (WHERE-guarded; the DB unique key on (provider, TrxID) already made the row unique).
      const claim = await db.paymentTransaction.updateMany({
        where: { id: row.id, matchedPaymentId: null, verificationStatus: { in: ["OBSERVED", "UNVERIFIED"] } },
        data: {
          matchedPaymentId: decision.paymentId!,
          verificationStatus: "MATCHED",
          trustLevel: 3,
          decisionMode: mode,
          verificationReasons: j(reasons),
          riskLevel: risk.riskLevel,
          riskScore: risk.riskScore,
        },
      });
      if (claim.count !== 1) {
        const cur = await db.paymentTransaction.findUniqueOrThrow({ where: { id: row.id } });
        return { ...base, ack: "ACK", serverStatus: cur.verificationStatus as TransactionVerificationStatus, paymentStatus: null, reasons: ["CONCURRENT_UPDATE"] };
      }
      await audit("match.matched");

      if (decision.action !== "VERIFY") {
        await notifyPaymentAdmins({
          title: mode === "SHADOW" ? "SMS evidence matched (shadow mode)" : "SMS evidence matched — awaiting verification",
          body: `A ${normalized.provider} SMS observation matches an order (${formatMoney(normalized.amountMinor, "BDT")}). Automatic verification did not run: ${reasons.join(", ") || "no reason recorded"}.`,
        });
        return { ...base, ack: "ACK", serverStatus: "MATCHED", paymentStatus: "AWAITING_VERIFICATION", reasons };
      }

      try {
        const paid = await markPaidAndEnroll(decision.paymentId!, "AUTOMATIC_SMS", null, { transactionRowId: row.id, deviceId: row.deviceId });
        await notifyAutomaticVerification(paid.id);
        logPayment("info", "payment.verified", { paymentId: paid.id, transactionRowId: row.id, deviceId: row.deviceId, outcome: "AUTOMATIC_SMS" });
        return { ...base, ack: "ACK", serverStatus: "VERIFIED", paymentStatus: paid.status, reasons };
      } catch (err) {
        // Atomic rollback happened; evidence stays MATCHED and the order stays AWAITING_VERIFICATION for a human.
        await audit("verify.failed", { error: err instanceof Error ? err.message : "unknown" });
        logPayment("error", "payment.verify_failed", { paymentId: decision.paymentId, transactionRowId: row.id, reason: err instanceof Error ? err.message : "unknown" });
        await notifyPaymentAdmins({ title: "Automatic verification failed", body: "A matched SMS transaction could not be applied automatically. Please verify manually." });
        return { ...base, ack: "ACK", serverStatus: "MATCHED", paymentStatus: "AWAITING_VERIFICATION", reasons: [...reasons, "VERIFY_FAILED"] };
      }
    }
  }
}

/**
 * Called right after a student submits their TrxID: if the device already
 * reported that transaction, evaluate it now (the student-entered value is
 * only a hint; runMatching re-verifies everything). If the transaction
 * hasn't arrived yet this is a no-op and the order simply waits.
 */
export async function matchStoredTransactionForPayment(paymentId: string): Promise<void> {
  try {
    const pay = await db.payment.findUnique({ where: { id: paymentId }, select: { transactionId: true, mfsProvider: true, status: true } });
    if (!pay?.transactionId || pay.status !== "AWAITING_VERIFICATION") return;
    const provider = pay.mfsProvider ?? "BKASH";
    const tx = await db.paymentTransaction.findUnique({
      where: { provider_transactionId: { provider, transactionId: pay.transactionId } },
      select: { id: true },
    });
    if (!tx) return;
    await runMatching(tx.id);
  } catch (err) {
    // Matching is an accelerator on top of the existing manual flow — it must never break TrxID submission.
    logPayment("error", "match.on_submit_failed", { paymentId, reason: err instanceof Error ? err.name : "unknown" });
  }
}
