import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { sendPaymentRejectedAlert } from "@/lib/payments/telegram";
import { enqueueWebhook } from "@/lib/payments/webhooks";
import { paymentCourseTitle } from "@/lib/payments/course-title";

// Not a "use server" module on purpose: every export of one is a server
// action anyone can call with any arguments, and this trusts its `admin`.

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
