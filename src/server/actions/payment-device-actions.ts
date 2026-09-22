"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/payments/reference";
import { generateRegistrationCode, normalizeRegistrationCode, REGISTRATION_CODE_TTL_MS, sha256Hex } from "@/lib/payments/sms/device-auth";
import { hashRules, providerRulesSchema } from "@/lib/payments/sms/rules";
import { MFS_PROVIDERS, type MfsProvider } from "@/lib/payments/sms/types";
import { canTransitionTransaction } from "@/lib/payments/sms/state-machine";
import { normalizeMsisdn } from "@/lib/payments/sms/amount";
import { requireAdminUser } from "./require-user";
import { writeAudit } from "@/server/services/payment-audit";

/**
 * Admin-only management of the SMS payment pipeline. Every mutation writes a
 * PaymentAuditLog row attributed to the acting admin.
 */

function assertProvider(p: string): MfsProvider {
  if (!(MFS_PROVIDERS as readonly string[]).includes(p)) throw new Error("Unknown provider.");
  return p as MfsProvider;
}

/** Creates a device slot and a one-time registration code (shown once, expires in 15 minutes). */
export async function createPaymentDevice(formData: FormData) {
  const admin = await requireAdminUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) throw new Error("Give the device a short name, e.g. \"Payment phone (bKash SIM)\".");

  const code = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + REGISTRATION_CODE_TTL_MS);
  const device = await db.paymentBridgeDevice.create({
    data: {
      name,
      // Placeholder nobody knows: the device cannot authenticate until it redeems the code.
      tokenHash: hashToken(randomBytes(32).toString("hex")),
      registrationCodeHash: sha256Hex(normalizeRegistrationCode(code)),
      registrationCodeExpiresAt: expiresAt,
    },
  });
  await writeAudit({ event: "device.created", actor: `user:${admin.id}`, deviceId: device.id, metadata: { name } });
  revalidatePath("/admin/settings/payments");
  return { deviceId: device.id, name, registrationCode: code, expiresAt: expiresAt.toISOString() };
}

/** Immediately blocks all future uploads from the device (checked on every request). */
export async function revokePaymentDevice(deviceId: string, reason?: string) {
  const admin = await requireAdminUser();
  const r = await db.paymentBridgeDevice.updateMany({
    where: { id: deviceId, isActive: true },
    // installId is released so the same phone can be registered again under a NEW device record.
    data: { isActive: false, revokedAt: new Date(), registrationCodeHash: null, registrationCodeExpiresAt: null, installId: null },
  });
  if (r.count === 1) await writeAudit({ event: "device.revoked", actor: `user:${admin.id}`, deviceId, metadata: { reason: reason?.slice(0, 200) ?? null } });
  revalidatePath("/admin/settings/payments");
}

export async function renamePaymentDevice(deviceId: string, name: string) {
  const admin = await requireAdminUser();
  const clean = name.trim();
  if (!clean || clean.length > 60) throw new Error("Invalid device name.");
  await db.paymentBridgeDevice.update({ where: { id: deviceId }, data: { name: clean } });
  await writeAudit({ event: "device.renamed", actor: `user:${admin.id}`, deviceId, metadata: { name: clean } });
  revalidatePath("/admin/settings/payments");
}

/** Publishes a NEW immutable provider-rule version. Existing versions are never edited. */
export async function publishProviderConfiguration(provider: string, rulesJson: string, enable: boolean) {
  const admin = await requireAdminUser();
  const p = assertProvider(provider);
  let raw: unknown;
  try {
    raw = JSON.parse(rulesJson);
  } catch {
    throw new Error("Rules must be valid JSON.");
  }
  const parsed = providerRulesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid rules: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const last = await db.providerConfiguration.findFirst({ where: { provider: p }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const row = await db.providerConfiguration.create({
    data: { provider: p, version, enabled: enable, rules: parsed.data as unknown as Prisma.InputJsonValue, rulesHash: hashRules(parsed.data), createdById: admin.id },
  });
  await writeAudit({ event: "providerConfig.published", actor: `user:${admin.id}`, metadata: { provider: p, version, enabled: enable, rulesHash: row.rulesHash } });
  revalidatePath("/admin/settings/payments");
  return { provider: p, version };
}

export async function setProviderConfigurationEnabled(provider: string, version: number, enabled: boolean) {
  const admin = await requireAdminUser();
  const p = assertProvider(provider);
  await db.providerConfiguration.update({ where: { provider_version: { provider: p, version } }, data: { enabled } });
  await writeAudit({ event: "providerConfig.toggled", actor: `user:${admin.id}`, metadata: { provider: p, version, enabled } });
  revalidatePath("/admin/settings/payments");
}

/** Per-provider receiving number shown at checkout (bumps its own version on every change). */
export async function upsertPaymentConfiguration(provider: string, receivingNumber: string, displayName: string, enabled: boolean) {
  const admin = await requireAdminUser();
  const p = assertProvider(provider);
  const number = normalizeMsisdn(receivingNumber);
  if (!number) throw new Error("Enter a valid 11-digit mobile number.");
  const existing = await db.paymentConfiguration.findUnique({ where: { provider: p } });
  await db.paymentConfiguration.upsert({
    where: { provider: p },
    create: { provider: p, receivingNumber: number, displayName: displayName.trim() || p, enabled },
    update: { receivingNumber: number, displayName: displayName.trim() || p, enabled, configurationVersion: { increment: 1 } },
  });
  await writeAudit({ event: "paymentConfig.updated", actor: `user:${admin.id}`, metadata: { provider: p, enabled, previousNumberChanged: existing ? existing.receivingNumber !== number : null } });
  revalidatePath("/admin/settings/payments");
}

/** OFF / SHADOW / ENFORCE rollout switch. The existing autoVerifyPayments kill switch still applies on top. */
export async function setSmsAutoVerifyMode(mode: string) {
  const admin = await requireAdminUser();
  if (mode !== "OFF" && mode !== "SHADOW" && mode !== "ENFORCE") throw new Error("Invalid mode.");
  const before = await db.siteSettings.findUnique({ where: { id: "singleton" }, select: { smsAutoVerifyMode: true } });
  await db.siteSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", smsAutoVerifyMode: mode }, update: { smsAutoVerifyMode: mode } });
  await writeAudit({ event: "smsAutoVerifyMode.changed", actor: `user:${admin.id}`, metadata: { from: before?.smsAutoVerifyMode ?? null, to: mode } });
  revalidatePath("/admin/settings/payments");
}

/**
 * Manual resolution of an isolated/unverified transaction. Never enrolls
 * anyone by itself: APPROVE only associates the evidence with an order that
 * is still AWAITING_VERIFICATION; the existing "Verify" button (also
 * audited) is what actually grants access.
 */
export async function resolveTransaction(transactionRowId: string, decision: "REJECT" | "ASSOCIATE", note: string, paymentId?: string) {
  const admin = await requireAdminUser();
  const reason = note.trim();
  if (reason.length < 5) throw new Error("A resolution note (min 5 characters) is required.");
  const row = await db.paymentTransaction.findUnique({ where: { id: transactionRowId } });
  if (!row) throw new Error("Transaction not found.");

  if (decision === "REJECT") {
    if (!canTransitionTransaction(row.verificationStatus, "REJECTED")) throw new Error(`A ${row.verificationStatus.toLowerCase()} transaction can't be rejected.`);
    const r = await db.paymentTransaction.updateMany({
      where: { id: row.id, verificationStatus: row.verificationStatus },
      data: { verificationStatus: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: reason },
    });
    if (r.count !== 1) throw new Error("This transaction changed — refresh and retry.");
    await writeAudit({ event: "transaction.rejected_by_admin", actor: `user:${admin.id}`, transactionId: row.id, metadata: { note: reason } });
  } else {
    if (!paymentId) throw new Error("Choose the payment to associate.");
    if (!canTransitionTransaction(row.verificationStatus, "MATCHED")) throw new Error(`A ${row.verificationStatus.toLowerCase()} transaction can't be associated.`);
    const pay = await db.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (!pay || pay.status !== "AWAITING_VERIFICATION") throw new Error("That payment isn't awaiting verification.");
    const r = await db.paymentTransaction.updateMany({
      where: { id: row.id, verificationStatus: row.verificationStatus, matchedPaymentId: null },
      data: {
        verificationStatus: "MATCHED",
        matchedPaymentId: paymentId,
        trustLevel: 3,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNote: reason,
        verificationReasons: ["ADMIN_ASSOCIATED"],
      },
    });
    if (r.count !== 1) throw new Error("This transaction changed or is already matched — refresh and retry.");
    await writeAudit({ event: "transaction.associated_by_admin", actor: `user:${admin.id}`, transactionId: row.id, paymentId, metadata: { note: reason } });
  }
  revalidatePath("/admin/payments");
}
