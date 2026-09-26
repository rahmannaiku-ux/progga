import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { sendTemplatedEmail } from "@/lib/email/send-email";
import { sendPaymentVerifiedAlert } from "@/lib/payments/telegram";
import { formatMoney } from "@/lib/payments/format";
import { writeAudit } from "./payment-audit";
import { enqueueWebhook } from "@/lib/payments/webhooks";

/**
 * Evidence from an approved Android device that this verification rests on.
 * When supplied, the observed transaction row is flipped MATCHED -> VERIFIED
 * inside the SAME database transaction as the payment and enrollment, so
 * it's impossible to end up with a PAID payment whose evidence isn't
 * consumed (or vice versa). Any failure rolls the whole thing back.
 */
export interface VerificationEvidence {
  transactionRowId: string;
  deviceId: string;
}

/**
 * The single place a payment becomes PAID and an Enrollment is created —
 * shared by admin verification, the legacy bridge endpoint, and SMS-device
 * verification. Moved here from the "use server" payment-actions module so
 * it is no longer an exported server action: this function performs no
 * caller authorization (callers do), and it should never be reachable as an
 * RPC endpoint from the browser.
 *
 * Behavior for the existing MANUAL_ADMIN / AUTOMATIC_API callers is
 * unchanged (same guards, same coupon-redemption logic, same idempotent
 * no-op on repeat calls).
 */
export async function markPaidAndEnroll(
  paymentId: string,
  method: "MANUAL_ADMIN" | "AUTOMATIC_API" | "AUTOMATIC_SMS",
  verifiedById: string | null,
  evidence?: VerificationEvidence
) {
  const wasAlreadyPaid = (await db.payment.findUnique({ where: { id: paymentId }, select: { status: true } }))?.status === "PAID";

  const result = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Payment not found.");
    if (payment.status === "PAID") {
      // Already verified (two admins, a retried request, a replayed upload) — idempotent no-op, never a second enrollment.
      return payment;
    }
    if (payment.status !== "AWAITING_VERIFICATION") {
      throw new Error(`Payment is ${payment.status.toLowerCase().replaceAll("_", " ")}, not awaiting verification.`);
    }

    // WHERE-guarded claim: under READ COMMITTED only the transaction that
    // flips AWAITING_VERIFICATION -> PAID gets count === 1.
    const claim = await tx.payment.updateMany({
      where: { id: paymentId, status: "AWAITING_VERIFICATION" },
      data: {
        status: "PAID",
        verificationMethod: method,
        verifiedById,
        verifiedAt: new Date(),
        ...(evidence ? { source: "sms-device", deviceId: evidence.deviceId } : {}),
      },
    });
    if (claim.count !== 1) {
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    }

    if (evidence) {
      // Consume the evidence atomically: it must still be MATCHED to THIS payment, and not yet used.
      const consumed = await tx.paymentTransaction.updateMany({
        where: { id: evidence.transactionRowId, matchedPaymentId: paymentId, verificationStatus: "MATCHED" },
        data: { verificationStatus: "VERIFIED", trustLevel: 4 },
      });
      if (consumed.count !== 1) {
        // Throwing rolls back the payment claim above — nothing is enrolled on stale/misused evidence.
        throw new Error("EVIDENCE_NOT_AVAILABLE");
      }
    }

    const enrollment = await tx.enrollment.upsert({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
      create: { userId: payment.userId, courseId: payment.courseId },
      update: {},
    });

    const updated = await tx.payment.update({ where: { id: paymentId }, data: { enrollmentId: enrollment.id } });

    if (!evidence) {
      // A human (or the legacy bridge) verified this order. If SMS evidence had already been matched to it,
      // mark that evidence consumed so it can never be reused; the trust level records backend verification.
      await tx.paymentTransaction.updateMany({
        where: { matchedPaymentId: paymentId, verificationStatus: "MATCHED" },
        data: { verificationStatus: "VERIFIED", trustLevel: 4 },
      });
    }

    // Coupon redemption — identical to the previous implementation (see CourseCoupon docs).
    if (payment.couponId) {
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
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }

    await tx.activityLog.create({
      data: { userId: verifiedById ?? payment.userId, action: "PAYMENT_VERIFIED", entityType: "Payment", entityId: paymentId },
    });

    await writeAudit(
      {
        event: "payment.verified",
        actor: evidence ? `device:${evidence.deviceId}` : verifiedById ? `user:${verifiedById}` : "system",
        paymentId,
        transactionId: evidence?.transactionRowId ?? null,
        deviceId: evidence?.deviceId ?? null,
        metadata: { method, evidenceSource: evidence ? "SMS_OBSERVED" : null, enrollmentId: enrollment.id },
      },
      tx
    );

    return updated;
  });

  // Enqueued AFTER the transaction commits, deliberately: a webhook receiver that's down or slow
  // must never gate, delay, or be able to undo a payment that has already been verified.
  if (!wasAlreadyPaid && result.status === "PAID") {
    await enqueueWebhook(paymentId, "payment.completed", {
      paymentId,
      status: result.status,
      method,
      amountCents: result.amountCents,
      currency: result.currency,
      courseId: result.courseId,
      verifiedAt: result.verifiedAt,
    });
  }

  return result;
}

/**
 * Best-effort student/admin notifications after an AUTOMATIC verification.
 * Runs OUTSIDE the verification transaction: a failed email must never undo
 * a payment that was verified.
 */
export async function notifyAutomaticVerification(paymentId: string) {
  const fresh = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      course: { select: { title: true } },
    },
  });
  if (!fresh || fresh.status !== "PAID") return;
  try {
    await db.notification.create({
      data: {
        userId: fresh.userId,
        type: "PAYMENT_VERIFIED",
        title: "Payment verified! 🎉",
        body: `Your payment for "${fresh.course.title}" was verified automatically. The mission is unlocked!`,
      },
    });
    if (fresh.user.email) {
      await sendTemplatedEmail(
        "payment-verified",
        fresh.user.email,
        { courseTitle: fresh.course.title },
        {
          subject: "Payment verified — you're in! 🎉",
          bodyHtml: "<p>Your payment for {{courseTitle}} was verified. It's unlocked on your dashboard now.</p>",
        }
      );
    }
    await sendPaymentVerifiedAlert({
      studentName: `${fresh.user.firstName} ${fresh.user.lastName}`,
      missionTitle: fresh.course.title,
      amountLabel: formatMoney(fresh.amountCents, fresh.currency),
      reference: fresh.paymentReference,
      txid: fresh.transactionId,
      automatic: true,
    });
  } catch (err) {
    console.error(JSON.stringify({ scope: "payment", event: "notify.failed", paymentId, reason: err instanceof Error ? err.name : "unknown" }));
  }
}
