"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { generatePaymentReference, generateDeviceToken, hashToken } from "@/lib/payments/reference";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTemplatedEmail } from "@/lib/email/send-email";
import { notifyPaymentAdmins } from "@/lib/payments/notify-admins";
import { sendPaymentVerifiedAlert, sendPaymentReviewAlert, sendPaymentRejectedAlert } from "@/lib/payments/telegram";
import { formatMoney } from "@/lib/payments/format";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";
import { computeCouponPriceCents, validateCouponUsable, normalizeCouponCode, type CouponLike } from "@/lib/payments/coupon";
import { requireAdminUser } from "./require-user";
import { requireCompletedProfile } from "@/lib/auth/require-auth";
// PHASE 5.5: startBkashPayment/submitBkashTxid/switchPaymentProvider
// below use requireCompletedProfile() rather than requireActiveUser()
// for the same reachability reason documented in enrollment-actions.ts
// — startBkashPayment in particular is reachable straight from the
// public /courses/[slug] page.
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { markPaidAndEnroll } from "@/server/services/payment-verification";
import { getReceivingNumber } from "@/server/services/payment-config";
import { matchStoredTransactionForPayment } from "@/server/services/sms-ingestion";
import { enqueueWebhook } from "@/lib/payments/webhooks";
import { MFS_PROVIDERS } from "@/lib/payments/sms/types";
import { paymentCourseTitle } from "@/lib/payments/course-title";
import { createCheckoutPayment, submitPaymentTxid } from "@/server/services/checkout";

/**
 * Entry point from "Enroll" on a paid mission. Returns the existing
 * in-flight payment if the student already started one (never spins up
 * a second reference for the same attempt), otherwise creates a new
 * PENDING row with the price re-derived from the DB — the browser never
 * supplies an amount.
 *
 * `couponCode` is optional and, like everything else here, only ever a
 * hint about which coupon to look up — the discount actually charged
 * is always recomputed from the DB coupon row and the course's current
 * priceCents, never from anything else the client sends alongside the
 * code. A coupon and the course's admin CourseDiscount are never
 * combined in one checkout: a valid coupon code takes over the price
 * calculation entirely (see computeCouponPriceCents), matching what
 * the buying page already showed the student in the apply preview.
 */
export async function startBkashPayment(courseId: string, couponCode?: string) {
  const user = await requireCompletedProfile();
  const { paymentId } = await createCheckoutPayment(user, courseId, couponCode);
  redirect(`/payments/${paymentId}`);
}

/** Student submits their bKash TXID against a PENDING payment row. */
export async function submitBkashTxid(paymentId: string, formData: FormData) {
  const user = await requireCompletedProfile();
  await submitPaymentTxid(user, paymentId, formData.get("transactionId"), formData.get("payerPhone"));
  revalidatePath(`/payments/${paymentId}`);
  redirect(`/payments/${paymentId}`);
}

/**
 * Lets the student change which MFS they intend to pay with, for an order that hasn't been paid yet.
 * Re-snapshots the receiving number the same way startBkashPayment does. A no-op if the payment
 * already has this provider. Refuses once a TXID has been submitted (AWAITING_VERIFICATION) or the
 * order is otherwise no longer open — switching after the fact would invalidate what the student
 * already sent, so the message tells them to start over instead of silently doing nothing.
 */
export async function switchPaymentProvider(paymentId: string, provider: string) {
  const user = await requireCompletedProfile();
  if (!(MFS_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Unknown payment method.");
  const mfsProvider = provider as (typeof MFS_PROVIDERS)[number];

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== user.id) throw new Error("Payment not found.");
  if (payment.status !== "PENDING") {
    throw new Error("This order is already in progress with its original payment method. Start a new checkout to switch.");
  }
  if (payment.mfsProvider === mfsProvider) return;

  const receivingNumber = await getReceivingNumber(mfsProvider);
  if (!receivingNumber) throw new Error(`${mfsProvider} isn't configured yet. Please choose another method or contact support.`);

  await db.payment.update({ where: { id: paymentId }, data: { mfsProvider, receivingNumber } });
  revalidatePath(`/payments/${paymentId}`);
}

/** Admin manual verification — always available regardless of the automatic-verification setting. */
export async function verifyPaymentManually(paymentId: string) {
  const admin = await requireAdminUser();
  const payment = await markPaidAndEnroll(paymentId, "MANUAL_ADMIN", admin.id);

  const fresh = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      course: { select: { title: true } },
    },
  });
  if (fresh) {
    await db.notification.create({
      data: {
        userId: fresh.userId,
        type: "PAYMENT_VERIFIED",
        title: "Payment verified! 🎉",
        body: `Your payment for "${paymentCourseTitle(fresh)}" was verified by the Proggaa team. The mission is unlocked!`,
      },
    });
    if (fresh.user.email) {
      await sendTemplatedEmail(
        "payment-verified",
        fresh.user.email,
        { courseTitle: paymentCourseTitle(fresh) },
        {
          subject: "Payment verified — you're in! 🎉",
          bodyHtml: "<p>Your payment for {{courseTitle}} was verified. It's unlocked on your dashboard now.</p>",
        }
      );
    }
    await sendPaymentVerifiedAlert({
      studentName: `${fresh.user.firstName} ${fresh.user.lastName}`,
      missionTitle: paymentCourseTitle(fresh),
      amountLabel: formatMoney(fresh.amountCents, fresh.currency),
      reference: fresh.paymentReference,
      txid: fresh.transactionId,
      automatic: false,
    });
  }

  revalidatePath("/admin/payments");
  revalidatePath(`/payments/${paymentId}`);
  return payment;
}

/**
 * Core rejection logic, decoupled from how the caller authenticated as
 * an admin — the website's session-authenticated form action and the
 * bot's API-key-authenticated route both resolve their own admin user
 * first, then call this so the business logic (and its race guard)
 * lives in exactly one place.
 */
export async function rejectPaymentCore(paymentId: string, admin: { id: string }, reason: string) {
  if (!reason.trim()) throw new Error("A rejection reason is required.");

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { email: true } }, course: { select: { title: true } } },
  });
  if (!payment) throw new Error("Payment not found.");
  if (payment.status !== "AWAITING_VERIFICATION") {
    throw new Error(
      payment.status === "PAID"
        ? "This payment was already verified and can't be rejected."
        : `Payment is ${payment.status.toLowerCase().replaceAll("_", " ")} and can't be rejected.`
    );
  }

  // Conditional update, not a plain by-id update: guards against a race
  // with markPaidAndEnroll verifying this exact payment at the same
  // moment (e.g. the bridge auto-verifies it a second before an admin
  // clicks Reject on a stale page). Without the status condition in the
  // WHERE clause, this could silently overwrite an already-PAID payment
  // back to REJECTED after the student's already been enrolled.
  const claim = await db.payment.updateMany({
    where: { id: paymentId, status: "AWAITING_VERIFICATION" },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      verificationMethod: "MANUAL_ADMIN",
      verifiedById: admin.id,
      verifiedAt: new Date(),
    },
  });
  if (claim.count !== 1) {
    throw new Error("This payment was just verified — refresh and check its current status.");
  }

  await db.activityLog.create({
    data: { userId: admin.id, action: "PAYMENT_REJECTED", entityType: "Payment", entityId: paymentId },
  });

  await db.notification.create({
    data: {
      userId: payment.userId,
      type: "PAYMENT_REJECTED",
      title: "Payment needs another look",
      body: `Your payment for "${paymentCourseTitle(payment)}" (${payment.paymentReference}) couldn't be verified: ${reason}`,
    },
  });
  await sendPaymentRejectedAlert({ reference: payment.paymentReference, reason });
  // After the claim above committed: a slow/down webhook receiver must never affect this outcome.
  await enqueueWebhook(paymentId, "payment.failed", { paymentId, status: "REJECTED", reason, courseId: payment.courseId });

  revalidatePath("/admin/payments");
  revalidatePath(`/payments/${paymentId}`);
}

export async function rejectPayment(paymentId: string, formData: FormData) {
  const admin = await requireAdminUser();
  const reason = String(formData.get("reason") ?? "").trim();
  return rejectPaymentCore(paymentId, admin, reason);
}

/**
 * Provisions a new Payment Bridge device (e.g. an admin's phone running
 * the future Android app). Returns the raw token exactly once — only its
 * SHA-256 hash is persisted, matching how no other secret in this
 * project is stored reversibly. If the token is lost, revoke this
 * device and create a new one rather than trying to recover it.
 */
export async function createBridgeDevice(formData: FormData) {
  const admin = await requireAdminUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Give the device a name, e.g. \"Admin's Pixel 8\".");

  const rawToken = generateDeviceToken();
  const device = await db.paymentBridgeDevice.create({
    data: { name, tokenHash: hashToken(rawToken) },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "CREATE", entityType: "PaymentBridgeDevice", entityId: device.id },
  });

  revalidatePath("/admin/settings/payments");
  // Shown once in the UI, never persisted client-side beyond this response.
  return { deviceId: device.id, name: device.name, rawToken };
}

export async function revokeBridgeDevice(deviceId: string) {
  const admin = await requireAdminUser();
  await db.paymentBridgeDevice.update({
    where: { id: deviceId },
    data: { isActive: false, revokedAt: new Date() },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "DELETE", entityType: "PaymentBridgeDevice", entityId: deviceId },
  });

  revalidatePath("/admin/settings/payments");
}

