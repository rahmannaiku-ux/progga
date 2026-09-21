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

/**
 * Shared by both verification paths (admin click, and the future
 * automatic bridge). Wraps the status flip + enrollment creation in one
 * transaction so it's impossible to end up with a PAID payment and no
 * enrollment, or vice versa — the exact invariant the spec calls out.
 * Callers must have already confirmed the payment is currently
 * AWAITING_VERIFICATION (checked again inside the transaction to close
 * the race between two verifiers hitting the same payment at once).
 */
async function markPaidAndEnroll(
  paymentId: string,
  method: "MANUAL_ADMIN" | "AUTOMATIC_API",
  verifiedById: string | null
) {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Payment not found.");
    if (payment.status === "PAID") {
      // Already verified (e.g. two admins clicked at once, or the bridge
      // retried an event after a slow first response) — idempotent no-op
      // rather than a duplicate enrollment or a confusing error.
      return payment;
    }
    if (payment.status !== "AWAITING_VERIFICATION") {
      // Explicitly blocks illegal jumps like REJECTED -> PAID or
      // EXPIRED -> PAID — the only legal transition into PAID is from
      // AWAITING_VERIFICATION, from either verification path.
      throw new Error(
        `Payment is ${payment.status.toLowerCase().replaceAll("_", " ")}, not awaiting verification.`
      );
    }

    // Atomically claim the transition. The read above is not enough on
    // its own — under READ COMMITTED (Postgres/Prisma's default), two
    // concurrent verifications (an admin double-click, an admin and the
    // bridge racing, a retried request) can both observe
    // AWAITING_VERIFICATION before either has written anything. A plain
    // `update` by id here would let BOTH transactions successfully
    // overwrite the row and BOTH send verification emails/Telegram
    // alerts to the student. This WHERE-guarded updateMany is the real
    // gate: only the transaction that flips AWAITING_VERIFICATION ->
    // PAID gets `count === 1` and creates the enrollment; the other
    // gets 0 and falls back to the idempotent-return path below.
    const claim = await tx.payment.updateMany({
      where: { id: paymentId, status: "AWAITING_VERIFICATION" },
      data: {
        status: "PAID",
        verificationMethod: method,
        verifiedById,
        verifiedAt: new Date(),
      },
    });
    if (claim.count !== 1) {
      // Lost the race to a concurrent verification of the same payment.
      // Whoever won already handles enrollment + side effects — return
      // the current row so this caller's flow completes as a no-op
      // rather than throwing a confusing error.
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    }

    const enrollment = await tx.enrollment.upsert({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
      create: { userId: payment.userId, courseId: payment.courseId },
      update: {},
    });

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { enrollmentId: enrollment.id },
    });

    // Redeem the coupon (if one was applied at checkout) only now that
    // the payment has actually been verified — never at checkout time,
    // so an abandoned/rejected payment never consumes a limited
    // coupon's uses. The WHERE-guarded updateMany is the same
    // race-safe pattern as the payment-status claim above: only a
    // transaction that still finds the coupon under its usage limit
    // actually increments it, closing the exact "two students redeem
    // the last slot at once" race a plain `update` would leave open.
    //
    // If the limit was hit by a concurrent verification between this
    // student's checkout and now, the increment below is skipped, but
    // enrollment still proceeds and the CouponRedemption row is still
    // written — the discount was already locked into amountCents at
    // checkout and the student already paid that amount, so declining
    // to honor it now would mean charging one price and delivering
    // another. usageCount simply reflects "successful redemptions,"
    // and a redemption made in good faith before the limit was reached
    // still counts as one.
    if (payment.couponId) {
      // A single atomic UPDATE ... WHERE, evaluated against the row's
      // current committed value by Postgres itself — this is the one
      // guard that genuinely can't be expressed as a typed Prisma
      // `updateMany` filter (it compares two columns of the same row,
      // usageCount against usageLimit), so it's the one place in this
      // codebase that reaches for $executeRaw rather than the ORM API.
      await tx.$executeRaw`
        UPDATE "CourseCoupon"
        SET "usageCount" = "usageCount" + 1
        WHERE "id" = ${payment.couponId}
          AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
      `;

      try {
        await tx.couponRedemption.create({
          data: {
            couponId: payment.couponId,
            userId: payment.userId,
            paymentId,
            discountCents: payment.couponDiscountCents ?? 0,
          },
        });
      } catch (err) {
        // P2002 on (couponId, userId) or the paymentId unique — this
        // exact redemption was already recorded (e.g. a retried
        // verification after a slow first response). Idempotent no-op,
        // matching the payment-status claim's own idempotent-return
        // philosophy above.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
          throw err;
        }
      }
    }

    await tx.activityLog.create({
      data: {
        userId: verifiedById ?? payment.userId,
        action: "PAYMENT_VERIFIED",
        entityType: "Payment",
        entityId: paymentId,
      },
    });

    return updated;
  });
}

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

  revalidatePath(`/payments/${paymentId}`);
  redirect(`/payments/${paymentId}`);
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

export { markPaidAndEnroll };
