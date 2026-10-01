import { db } from "@/lib/db/client";
import type { Role } from "@prisma/client";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { sendTemplatedEmail } from "@/lib/email/send-email";

/**
 * Enrolls a hero in a FREE Mission. Shared by the website's Server Action
 * (src/server/actions/enrollment-actions.ts) and the Telegram bot's routes, so both go
 * through the same checks. Paid Missions go through checkout (services/checkout.ts).
 * The caller identifies the user and does any redirect. Not a "use server" file on
 * purpose: this must never be callable from a browser.
 */
export async function enrollInFreeCourse(
  user: { id: string; role: Role; email: string | null },
  courseId: string
): Promise<{ slug: string }> {
  if (!(await isFeatureEnabled("course_purchases", { userId: user.id, role: user.role }))) {
    throw new Error("New enrollments are temporarily paused. Please try again shortly.");
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, isFree: true, slug: true },
  });
  if (!course || course.status !== "PUBLISHED") {
    throw new Error("This mission isn't available right now.");
  }

  // Paid missions no longer dead-end here (Phase 11 — manual bKash
  // payments). Enroll() stays free-only; the "Enroll" button on a paid
  // mission calls startBkashPayment() instead, which creates a Payment
  // row server-side (price re-derived from the DB, never trusted from
  // the client) and sends the student to /payments/[id].
  if (!course.isFree) {
    throw new Error(
      "This is a paid mission — use the payment flow to unlock it, not direct enrollment."
    );
  }

  const existingEnrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  if (!existingEnrollment) {
    // Only a genuinely new enrollment gets a log entry and a
    // confirmation email — re-running this on an already-enrolled
    // student (double-click, page resubmit, etc.) is a pure no-op
    // below, matching what the upsert's empty `update: {}` already
    // signaled was the intent.
    let created = true;
    try {
      await db.enrollment.create({ data: { userId: user.id, courseId } });
    } catch (err) {
      // P2002 = unique constraint violation. findUnique + create isn't
      // atomic the way the old upsert was, so two near-simultaneous
      // enroll clicks can both see "not enrolled yet" and both attempt
      // to create — same race as the lazy-user-create in
      // lib/auth/current-user.ts, handled the same way: whichever loses
      // just treats it as "already enrolled" (skips the log/email
      // below) instead of crashing.
      const isDuplicateKey =
        err && typeof err === "object" && "code" in err && err.code === "P2002";
      if (!isDuplicateKey) throw err;
      created = false;
    }

    if (created) {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "ENROLL",
          entityType: "Course",
          entityId: courseId,
        },
      });

      if (user.email) {
        await sendTemplatedEmail(
          "enrollment-confirmed",
          user.email,
          { courseTitle: course.title },
          {
            subject: "You're enrolled!",
            bodyHtml: "<p>You're in — {{courseTitle}} is now on your dashboard.</p>",
          }
        );
      }
    }
  }

  return { slug: course.slug };
}
