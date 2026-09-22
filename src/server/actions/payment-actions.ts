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
import { requireActiveUser, requireAdminUser } from "./require-user";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { markPaidAndEnroll } from "@/server/services/payment-verification";
import { getReceivingNumber } from "@/server/services/payment-config";
import { matchStoredTransactionForPayment } from "@/server/services/sms-ingestion";
import { enqueueWebhook } from "@/lib/payments/webhooks";
import { MFS_PROVIDERS } from "@/lib/payments/sms/types";

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
  const user = await requireActiveUser();

  if (!(await isFeatureEnabled("course_purchases", { userId: user.id, role: user.role }))) {
    throw new Error("Course purchases are temporarily paused. Please try again shortly.");
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      status: true,
      isFree: true,
      priceCents: true,
      currency: true,
      discount: {
        select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
      },
    },
  });
  if (!course || course.status !== "PUBLISHED") {
    throw new Error("This mission isn't available right now.");
  }
  if (course.isFree) {
    throw new Error("This mission is free — use Enroll directly, no payment needed.");
  }

  const alreadyEnrolled = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (alreadyEnrolled) {
    throw new Error("You're already enrolled in this mission.");
  }

  // The only place a paid mission's charge amount is decided. `now` is
  // the server's own clock — never anything supplied by the client —
  // so a scheduled discount can't be forced early, an expired one
  // can't be reused, and a disabled one can't be toggled back on from
  // outside the admin action. The browser never sends a price at all,
  // only (optionally) a coupon code — there's nothing here for a
  // manipulated client value to override.
  let chargeCents: number;
  let redeemedCoupon: { id: string; code: string; discountCents: number } | null = null;

  if (couponCode && couponCode.trim()) {
    const normalized = normalizeCouponCode(couponCode);
    const coupon = await db.courseCoupon.findUnique({
      where: { courseId_code: { courseId, code: normalized } },
    });
    const usable = validateCouponUsable(coupon as CouponLike | null);
    if (!usable.ok) throw new Error(usable.reason);

    const alreadyRedeemed = await db.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon!.id, userId: user.id } },
    });
    if (alreadyRedeemed) throw new Error("You've already used this coupon.");

    const price = computeCouponPriceCents(course.priceCents, coupon!);
    chargeCents = price.finalCents;
    redeemedCoupon = { id: coupon!.id, code: normalized, discountCents: price.amountOffCents };
  } else {
    chargeCents = computeDiscountedPriceCents(course.priceCents, course.discount).finalCents;
  }

  const existing = await db.payment.findFirst({
    where: {
      userId: user.id,
      courseId,
      status: { in: ["PENDING", "AWAITING_VERIFICATION"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) redirect(`/payments/${existing.id}`);

  const receivingNumber = await getReceivingNumber("BKASH");

  let reference = generatePaymentReference();
  // Collision odds at 6 chars over a 32-char alphabet are ~1 in a
  // billion, but the unique constraint is the real guarantee — retry a
  // couple of times on the rare conflict rather than crashing the flow.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const payment = await db.payment.create({
        data: {
          userId: user.id,
          courseId,
          amountCents: chargeCents,
          currency: course.currency,
          provider: "MANUAL_BKASH",
          // SMS automation: snapshot which MFS/number the student was told to pay, so matching can
          // verify provider + receiver later. Legacy checkout is bKash-only.
          mfsProvider: "BKASH",
          receivingNumber,
          paymentReference: reference,
          status: "PENDING",
          source: "web",
          ...(redeemedCoupon
            ? {
                couponId: redeemedCoupon.id,
                couponCode: redeemedCoupon.code,
                couponDiscountCents: redeemedCoupon.discountCents,
              }
            : {}),
        },
      });
      // Best-effort; a webhook receiver being down must never block checkout.
      await enqueueWebhook(payment.id, "payment.created", {
        paymentId: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        courseId: payment.courseId,
        provider: payment.mfsProvider,
      });
      redirect(`/payments/${payment.id}`);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 4
      ) {
        reference = generatePaymentReference();
        continue;
      }
      throw err;
    }
  }
  throw new Error("Couldn't generate a payment reference — try again.");
}

/** Student submits their bKash TXID against a PENDING payment row. */
export async function submitBkashTxid(paymentId: string, formData: FormData) {
  const user = await requireActiveUser();

  const { success } = await checkRateLimit("strict", user.id);
  if (!success) throw new Error("Too many attempts — please wait a moment and try again.");

  const transactionId = String(formData.get("transactionId") ?? "").trim().toUpperCase();
  const payerPhone = String(formData.get("payerPhone") ?? "").trim() || null;

  if (!transactionId || transactionId.length < 6 || transactionId.length > 20) {
    throw new Error("Enter a valid bKash Transaction ID (usually 8–12 characters).");
  }
  // bKash TXIDs are alphanumeric; reject anything else outright rather
  // than storing junk that will never match a real transaction.
  if (!/^[A-Z0-9]+$/.test(transactionId)) {
    throw new Error("A Transaction ID only contains letters and numbers.");
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { course: { select: { title: true } } },
  });
  if (!payment || payment.userId !== user.id) {
    throw new Error("Payment not found.");
  }
  if (payment.status !== "PENDING") {
    throw new Error(
      payment.status === "AWAITING_VERIFICATION"
        ? "This payment has already been submitted and is awaiting verification."
        : `This payment is ${payment.status.toLowerCase().replaceAll("_", " ")} and can't be resubmitted.`
    );
  }

  try {
    await db.payment.update({
      where: { id: paymentId },
      data: { transactionId, payerPhone, status: "AWAITING_VERIFICATION" },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(
        "That Transaction ID has already been submitted for another payment. Double-check your bKash SMS."
      );
    }
    throw err;
  }

  await db.activityLog.create({
    data: { userId: user.id, action: "PAYMENT_SUBMITTED", entityType: "Payment", entityId: paymentId },
  });

  await notifyPaymentAdmins({
    title: "Payment awaiting verification",
    body: `${user.firstName} ${user.lastName} submitted a bKash TXID for "${payment.course.title}" (${payment.paymentReference}).`,
  });
  await sendPaymentReviewAlert({
    reference: payment.paymentReference,
    amountLabel: formatMoney(payment.amountCents, payment.currency),
    txid: transactionId,
  });

  // If the Android payment device already observed this transaction, evaluate it now. The TrxID the
  // student typed is only a hint; the matching engine re-verifies provider, receiver, amount and window.
  await matchStoredTransactionForPayment(paymentId);

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
  const user = await requireActiveUser();
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
        body: `Your payment for "${fresh.course.title}" was verified by the Proggaa team. The mission is unlocked!`,
      },
    });
    await sendTemplatedEmail(
      "payment-verified",
      fresh.user.email,
      { courseTitle: fresh.course.title },
      {
        subject: "Payment verified — you're in! 🎉",
        bodyHtml: "<p>Your payment for {{courseTitle}} was verified. It's unlocked on your dashboard now.</p>",
      }
    );
    await sendPaymentVerifiedAlert({
      studentName: `${fresh.user.firstName} ${fresh.user.lastName}`,
      missionTitle: fresh.course.title,
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
 * an admin — the website's Clerk-authenticated form action and the
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
      body: `Your payment for "${payment.course.title}" (${payment.paymentReference}) couldn't be verified: ${reason}`,
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

