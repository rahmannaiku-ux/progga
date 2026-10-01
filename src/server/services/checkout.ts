import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { generatePaymentReference } from "@/lib/payments/reference";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyPaymentAdmins } from "@/lib/payments/notify-admins";
import { sendPaymentReviewAlert } from "@/lib/payments/telegram";
import { formatMoney } from "@/lib/payments/format";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";
import { computeCouponPriceCents, validateCouponUsable, normalizeCouponCode, type CouponLike } from "@/lib/payments/coupon";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { markPaidAndEnroll } from "@/server/services/payment-verification";
import { getReceivingNumber } from "@/server/services/payment-config";
import { matchStoredTransactionForPayment } from "@/server/services/sms-ingestion";
import { enqueueWebhook } from "@/lib/payments/webhooks";
import { paymentCourseTitle } from "@/lib/payments/course-title";

/**
 * Checkout, shared by the website's Server Actions (src/server/actions/payment-actions.ts)
 * and the Telegram bot's routes (src/app/api/bot/*). The logic lives here once, so a
 * payment started from Telegram goes through exactly the same checks as one started on
 * the website: the price is always derived from the database, coupons are re-validated,
 * and an in-flight order is reused. The caller is responsible for identifying the user
 * (a session on the website, a linked Telegram account in the bot) and for any redirect.
 *
 * NOT a "use server" file on purpose: these must never be callable from a browser.
 */

type CheckoutUser = { id: string; role: Role };
type PayerUser = { id: string; firstName: string; lastName: string };

/**
 * Entry point from "Enroll" on a paid mission. Returns the existing
 * in-flight payment if the student already started one (never spins up
 * a second reference for the same attempt), otherwise creates a new
 * PENDING row with the price re-derived from the DB. The client never
 * supplies an amount.
 *
 * `couponCode` is optional and only ever a hint about which coupon to look up:
 * the discount actually charged is always recomputed from the DB coupon row and
 * the course's current priceCents. A coupon and the course's admin CourseDiscount
 * are never combined in one checkout.
 */
export async function createCheckoutPayment(
  user: CheckoutUser,
  courseId: string,
  couponCode?: string
): Promise<{ paymentId: string }> {

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
  if (existing) {
    // Reuse the in-flight order only when it matches what the student is
    // asking for now. An unpaid PENDING order (no TXID yet, so no money
    // sent) with a different coupon — typically the full-price order from
    // a first click, before a coupon was applied — is cancelled and a new
    // one created below, instead of silently ignoring the coupon.
    // AWAITING_VERIFICATION always wins: the student may have paid already.
    const sameCoupon = (existing.couponCode ?? null) === (redeemedCoupon?.code ?? null);
    if (existing.status === "AWAITING_VERIFICATION" || sameCoupon) return { paymentId: existing.id };
    await db.payment.updateMany({
      where: { id: existing.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  }

  // A 100%-off coupon leaves nothing to pay, so there's no TXID for the
  // student to submit and nothing for an admin or device to verify —
  // the order is created already awaiting verification and immediately
  // marked PAID below through the same markPaidAndEnroll path every
  // other verification uses (enrollment, coupon redemption, audit, SMS).
  // Only a coupon can get here: computeDiscountedPriceCents never reaches 0
  // for a paid course without one, and the price is always server-derived.
  const fullyDiscounted = redeemedCoupon !== null && chargeCents <= 0;
  if (fullyDiscounted) chargeCents = 0;

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
          courseTitle: course.title, // snapshot: the invoice must survive a course delete
          amountCents: chargeCents,
          currency: course.currency,
          provider: "MANUAL_BKASH",
          // SMS automation: snapshot which MFS/number the student was told to pay, so matching can
          // verify provider + receiver later. Legacy checkout is bKash-only.
          mfsProvider: "BKASH",
          receivingNumber,
          paymentReference: reference,
          status: fullyDiscounted ? "AWAITING_VERIFICATION" : "PENDING",
          source: fullyDiscounted ? "coupon" : "web",
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
      if (fullyDiscounted) {
        await markPaidAndEnroll(payment.id, "FULL_DISCOUNT_COUPON", null);
        await db.notification.create({
          data: {
            userId: user.id,
            type: "PAYMENT_VERIFIED",
            title: "Mission unlocked! 🎉",
            body: `Your coupon ${redeemedCoupon!.code} covered the full price of "${course.title}". The mission is unlocked!`,
          },
        });
        revalidatePath("/my-courses");
        revalidatePath("/dashboard");
      }
      return { paymentId: payment.id };
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
export async function submitPaymentTxid(
  user: PayerUser,
  paymentId: string,
  rawTransactionId: unknown,
  rawPayerPhone: unknown
): Promise<void> {
  const { success } = await checkRateLimit("strict", user.id);
  if (!success) throw new Error("Too many attempts — please wait a moment and try again.");

  const transactionId = String(rawTransactionId ?? "").trim().toUpperCase();
  const payerPhone = String(rawPayerPhone ?? "").trim() || null;

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
    body: `${user.firstName} ${user.lastName} submitted a bKash TXID for "${paymentCourseTitle(payment)}" (${payment.paymentReference}).`,
  });
  await sendPaymentReviewAlert({
    reference: payment.paymentReference,
    amountLabel: formatMoney(payment.amountCents, payment.currency),
    txid: transactionId,
  });

  // If the Android payment device already observed this transaction, evaluate it now. The TrxID the
  // student typed is only a hint; the matching engine re-verifies provider, receiver, amount and window.
  await matchStoredTransactionForPayment(paymentId);
}
