import { Prisma, type CourseMigration } from "@prisma/client";
import { db } from "@/lib/db/client";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";
import { formatMoney } from "@/lib/payments/format";
import { generatePaymentReference } from "@/lib/payments/reference";
import { getReceivingNumber } from "@/server/services/payment-config";
import {
  SWITCH_REASON_TEXT,
  selfSwitchEligibility,
  switchDifferenceCents,
} from "@/lib/course-migration/rules";

/**
 * Mission switches: a student moves from a mission they own to another one.
 *
 * - The first switch is the student's own (rules in lib/course-migration/rules.ts). Later ones
 *   are requests an admin approves or rejects.
 * - Free when the new mission costs the same or less; otherwise the difference is paid like any
 *   other order (a Payment for the new mission), and the switch finishes when that payment is
 *   verified (completeSwitchForPaymentTx, called from markPaidAndEnroll).
 * - Finishing a switch enrolls the student in the new mission and removes the old enrollment, so
 *   every access check in the app stops granting the old mission without knowing about switches.
 *   The old payment stays as the receipt; this row records what happened.
 *
 * NOT a "use server" file: the actions in server/actions/course-migration-actions.ts identify
 * the user and call these.
 */

export type SwitchResult =
  | { ok: true; status: "COMPLETED"; migrationId: string }
  | { ok: true; status: "AWAITING_PAYMENT"; migrationId: string; paymentId: string }
  | { ok: true; status: "REQUESTED"; migrationId: string }
  | { ok: false; error: string };

const OPEN_STATUSES = ["REQUESTED", "AWAITING_PAYMENT"] as const;

const coursePriceSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  isFree: true,
  priceCents: true,
  currency: true,
  discount: {
    select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
  },
} satisfies Prisma.CourseSelect;

type PricedCourse = Prisma.CourseGetPayload<{ select: typeof coursePriceSelect }>;

/** What a mission costs to buy today (0 for a free one). */
export function currentPriceCents(course: PricedCourse): number {
  if (course.isFree) return 0;
  return computeDiscountedPriceCents(course.priceCents, course.discount).finalCents;
}

/** The list price of the mission being left, which is what the student's seat in it is worth. */
function seatValueCents(course: PricedCourse): number {
  return course.isFree ? 0 : course.priceCents;
}

export async function countSelfSwitches(userId: string): Promise<number> {
  return db.courseMigration.count({ where: { userId, byAdmin: false, status: "COMPLETED" } });
}

export async function findOpenSwitch(userId: string) {
  return db.courseMigration.findFirst({
    where: { userId, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: "desc" },
    include: { payment: { select: { id: true, status: true } } },
  });
}

/**
 * A switch waiting on a payment the student never sent (the order expired or was cancelled)
 * is closed, so it doesn't block a new one.
 */
async function closeStaleSwitches(userId: string) {
  const stale = await db.courseMigration.findMany({
    where: {
      userId,
      status: "AWAITING_PAYMENT",
      OR: [{ paymentId: null }, { payment: { status: { in: ["EXPIRED", "CANCELLED", "REJECTED"] } } }],
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.courseMigration.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "CANCELLED" },
    });
  }
}

export type SwitchQuote = {
  from: { id: string; title: string; valueCents: number };
  to: { id: string; title: string; slug: string; priceCents: number };
  differenceCents: number;
};

async function loadPair(userId: string, fromCourseId: string, toCourseId: string) {
  const [from, to, fromEnrollment, toEnrollment] = await Promise.all([
    db.course.findUnique({ where: { id: fromCourseId }, select: coursePriceSelect }),
    db.course.findUnique({ where: { id: toCourseId }, select: coursePriceSelect }),
    db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: fromCourseId } } }),
    db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: toCourseId } } }),
  ]);
  return { from, to, fromEnrollment, toEnrollment };
}

export function quoteFor(from: PricedCourse, to: PricedCourse): SwitchQuote {
  const valueCents = seatValueCents(from);
  const priceCents = currentPriceCents(to);
  return {
    from: { id: from.id, title: from.title, valueCents },
    to: { id: to.id, title: to.title, slug: to.slug, priceCents },
    differenceCents: switchDifferenceCents(valueCents, priceCents),
  };
}

/** Missions a student could switch to from `fromCourseId`, with what each would cost them. */
export async function listSwitchTargets(userId: string, fromCourseId: string) {
  const [from, owned, courses] = await Promise.all([
    db.course.findUnique({ where: { id: fromCourseId }, select: coursePriceSelect }),
    db.enrollment.findMany({ where: { userId }, select: { courseId: true } }),
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { ...coursePriceSelect, thumbnailUrl: true, category: { select: { name: true } } },
    }),
  ]);
  if (!from) return null;
  const ownedIds = new Set(owned.map((o) => o.courseId));
  return {
    from,
    targets: courses
      .filter((c) => c.id !== fromCourseId && !ownedIds.has(c.id))
      .map((c) => ({ course: c, quote: quoteFor(from, c) })),
  };
}

async function createDifferencePayment(
  tx: Prisma.TransactionClient,
  input: { userId: string; to: PricedCourse; amountCents: number; receivingNumber: string | null }
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.payment.create({
        data: {
          userId: input.userId,
          courseId: input.to.id,
          courseTitle: input.to.title,
          amountCents: input.amountCents,
          currency: input.to.currency,
          provider: "MANUAL_BKASH",
          mfsProvider: "BKASH",
          receivingNumber: input.receivingNumber,
          paymentReference: generatePaymentReference(),
          status: "PENDING",
          source: "mission-switch",
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Couldn't create the payment. Please try again.");
}

/**
 * Moves the enrollment: the student is enrolled in the new mission and the old enrollment is
 * removed. Runs inside the caller's transaction.
 */
async function finishSwitchTx(tx: Prisma.TransactionClient, migration: CourseMigration, now: Date) {
  if (!migration.toCourseId) throw new Error("The new mission no longer exists.");
  await tx.enrollment.upsert({
    where: { userId_courseId: { userId: migration.userId, courseId: migration.toCourseId } },
    create: { userId: migration.userId, courseId: migration.toCourseId },
    update: {},
  });
  if (migration.fromCourseId) {
    await tx.enrollment.deleteMany({ where: { userId: migration.userId, courseId: migration.fromCourseId } });
    await tx.wishlist.deleteMany({ where: { userId: migration.userId, courseId: migration.toCourseId } });
  }
  await tx.courseMigration.update({
    where: { id: migration.id },
    data: { status: "COMPLETED", completedAt: now },
  });
  await tx.activityLog.create({
    data: {
      userId: migration.handledById ?? migration.userId,
      action: "ENROLL",
      entityType: "CourseMigration",
      entityId: migration.id,
      metadata: { from: migration.fromCourseTitle, to: migration.toCourseTitle, studentId: migration.userId },
    },
  });
  await tx.notification.create({
    data: {
      userId: migration.userId,
      type: "ENROLLMENT",
      title: "Mission switched",
      body: `You've moved from "${migration.fromCourseTitle}" to "${migration.toCourseTitle}". Your new mission is ready.`,
      linkUrl: `/missions/${migration.toCourseId}`,
    },
  });
}

/**
 * Called by markPaidAndEnroll inside its transaction, after the paid mission's enrollment
 * exists. If this payment was a switch's difference, the switch finishes now.
 */
export async function completeSwitchForPaymentTx(tx: Prisma.TransactionClient, paymentId: string) {
  const migration = await tx.courseMigration.findUnique({ where: { paymentId } });
  if (!migration || migration.status !== "AWAITING_PAYMENT") return;
  await finishSwitchTx(tx, migration, new Date());
}

/** Starts or performs a switch. Shared by the student's own switch and an admin's. */
async function startSwitch(input: {
  userId: string;
  from: PricedCourse;
  to: PricedCourse;
  byAdmin: boolean;
  handledById: string | null;
  waiveFee: boolean;
  reason: string | null;
  adminNote: string | null;
  existingRequestId?: string;
}): Promise<SwitchResult> {
  const quote = quoteFor(input.from, input.to);
  const difference = input.waiveFee ? 0 : quote.differenceCents;
  const receivingNumber = difference > 0 ? await getReceivingNumber("BKASH") : null;
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const data = {
      userId: input.userId,
      fromCourseId: input.from.id,
      toCourseId: input.to.id,
      fromCourseTitle: input.from.title,
      toCourseTitle: input.to.title,
      fromPriceCents: quote.from.valueCents,
      toPriceCents: quote.to.priceCents,
      differenceCents: difference,
      byAdmin: input.byAdmin,
      feeWaived: input.waiveFee && quote.differenceCents > 0,
      handledById: input.handledById,
      adminNote: input.adminNote,
      status: "AWAITING_PAYMENT" as const,
      ...(input.reason !== null ? { reason: input.reason } : {}),
    };
    const migration = input.existingRequestId
      ? await tx.courseMigration.update({ where: { id: input.existingRequestId }, data })
      : await tx.courseMigration.create({ data });

    if (difference <= 0) {
      await finishSwitchTx(tx, migration, now);
      return { status: "COMPLETED" as const, migrationId: migration.id };
    }

    // An unpaid order the student had already started for the new mission is replaced by this one.
    await tx.payment.updateMany({
      where: { userId: input.userId, courseId: input.to.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    const payment = await createDifferencePayment(tx, {
      userId: input.userId,
      to: input.to,
      amountCents: difference,
      receivingNumber,
    });
    await tx.courseMigration.update({ where: { id: migration.id }, data: { paymentId: payment.id } });
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: "SYSTEM",
        title: "Pay the difference to finish your switch",
        body: `Moving to "${input.to.title}" costs ${formatMoney(difference)} more. Pay it and your switch finishes once the payment is checked.`,
        linkUrl: `/payments/${payment.id}`,
      },
    });
    return { status: "AWAITING_PAYMENT" as const, migrationId: migration.id, paymentId: payment.id };
  });

  return { ok: true, ...result };
}

/** The student's own switch (the one they get without an admin). */
export async function switchMissionSelf(userId: string, fromCourseId: string, toCourseId: string): Promise<SwitchResult> {
  await closeStaleSwitches(userId);
  const [{ from, to, fromEnrollment, toEnrollment }, completedSelfSwitches, open] = await Promise.all([
    loadPair(userId, fromCourseId, toCourseId),
    countSelfSwitches(userId),
    findOpenSwitch(userId),
  ]);
  if (!from || !to) return { ok: false, error: SWITCH_REASON_TEXT.unavailable };
  const eligibility = selfSwitchEligibility({
    completedSelfSwitches,
    hasOpenSwitch: Boolean(open),
    fromCourseId,
    toCourseId,
    ownsFrom: Boolean(fromEnrollment),
    fromIsFree: from.isFree || from.priceCents <= 0,
    ownsTo: Boolean(toEnrollment),
    toPublished: to.status === "PUBLISHED",
  });
  if (!eligibility.ok) return { ok: false, error: SWITCH_REASON_TEXT[eligibility.reason] };

  return startSwitch({ userId, from, to, byAdmin: false, handledById: null, waiveFee: false, reason: null, adminNote: null });
}

/** After the student's own switch is used: a request an admin decides on. */
export async function requestMissionSwitch(
  userId: string,
  fromCourseId: string,
  toCourseId: string,
  reason: string
): Promise<SwitchResult> {
  await closeStaleSwitches(userId);
  const [{ from, to, fromEnrollment, toEnrollment }, open] = await Promise.all([
    loadPair(userId, fromCourseId, toCourseId),
    findOpenSwitch(userId),
  ]);
  if (!from || !to || to.status !== "PUBLISHED") return { ok: false, error: SWITCH_REASON_TEXT.unavailable };
  if (fromCourseId === toCourseId) return { ok: false, error: SWITCH_REASON_TEXT.same };
  if (!fromEnrollment) return { ok: false, error: SWITCH_REASON_TEXT.not_owned };
  if (toEnrollment) return { ok: false, error: SWITCH_REASON_TEXT.already_enrolled };
  if (open) return { ok: false, error: SWITCH_REASON_TEXT.pending };
  const trimmed = reason.trim().slice(0, 1000);
  if (trimmed.length < 5) return { ok: false, error: "Tell the admins briefly why you want to switch." };

  const quote = quoteFor(from, to);
  const migration = await db.courseMigration.create({
    data: {
      userId,
      fromCourseId,
      toCourseId,
      fromCourseTitle: from.title,
      toCourseTitle: to.title,
      fromPriceCents: quote.from.valueCents,
      toPriceCents: quote.to.priceCents,
      differenceCents: quote.differenceCents,
      status: "REQUESTED",
      reason: trimmed,
    },
  });

  const admins = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (admins.length > 0) {
    await db.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "SYSTEM" as const,
        title: "Mission switch request",
        body: `A student asks to move from "${from.title}" to "${to.title}".`,
        linkUrl: "/admin/mission-switches",
      })),
    });
  }
  return { ok: true, status: "REQUESTED", migrationId: migration.id };
}

/** The student cancels a switch that is still waiting (a request, or an unpaid difference). */
export async function cancelMissionSwitch(userId: string, migrationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const migration = await db.courseMigration.findUnique({
    where: { id: migrationId },
    include: { payment: { select: { id: true, status: true } } },
  });
  if (!migration || migration.userId !== userId) return { ok: false, error: "Switch not found." };
  if (migration.status !== "REQUESTED" && migration.status !== "AWAITING_PAYMENT") {
    return { ok: false, error: "This switch can't be cancelled any more." };
  }
  if (migration.payment?.status === "AWAITING_VERIFICATION" || migration.payment?.status === "PAID") {
    return { ok: false, error: "Your payment is already being checked, so this switch can't be cancelled now." };
  }
  await db.$transaction(async (tx) => {
    await tx.courseMigration.update({ where: { id: migrationId }, data: { status: "CANCELLED" } });
    if (migration.payment) {
      await tx.payment.updateMany({ where: { id: migration.payment.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    }
  });
  return { ok: true };
}

/**
 * An admin switches a student, either on their own initiative or by approving a request.
 * `waiveFee` lets the admin skip the difference.
 */
export async function adminSwitchMission(input: {
  adminId: string;
  userId: string;
  fromCourseId: string;
  toCourseId: string;
  waiveFee: boolean;
  note: string | null;
  requestId?: string;
}): Promise<SwitchResult> {
  await closeStaleSwitches(input.userId);
  const { from, to, fromEnrollment, toEnrollment } = await loadPair(input.userId, input.fromCourseId, input.toCourseId);
  if (!from || !to) return { ok: false, error: "One of these missions no longer exists." };
  if (from.id === to.id) return { ok: false, error: SWITCH_REASON_TEXT.same };
  if (!fromEnrollment) return { ok: false, error: "The student isn't enrolled in the mission they'd leave." };
  if (toEnrollment) return { ok: false, error: "The student is already enrolled in the new mission." };

  const open = await findOpenSwitch(input.userId);
  if (open && open.id !== input.requestId) {
    if (open.payment?.status === "AWAITING_VERIFICATION") {
      return { ok: false, error: "This student has a switch payment waiting to be checked. Verify or reject it first." };
    }
    await cancelMissionSwitch(input.userId, open.id);
  }
  if (input.requestId) {
    const request = await db.courseMigration.findUnique({ where: { id: input.requestId } });
    if (!request || request.status !== "REQUESTED" || request.userId !== input.userId) {
      return { ok: false, error: "This request was already handled." };
    }
  }

  return startSwitch({
    userId: input.userId,
    from,
    to,
    byAdmin: true,
    handledById: input.adminId,
    waiveFee: input.waiveFee,
    reason: null,
    adminNote: input.note?.trim().slice(0, 1000) || null,
    existingRequestId: input.requestId,
  });
}

export async function rejectMissionSwitchRequest(
  adminId: string,
  requestId: string,
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.courseMigration.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "REQUESTED") return { ok: false, error: "This request was already handled." };
  const trimmed = note.trim().slice(0, 1000);
  await db.$transaction([
    db.courseMigration.update({
      where: { id: requestId },
      data: { status: "REJECTED", handledById: adminId, adminNote: trimmed || null },
    }),
    db.notification.create({
      data: {
        userId: request.userId,
        type: "SYSTEM",
        title: "Mission switch not approved",
        body: trimmed
          ? `Your request to move to "${request.toCourseTitle}" wasn't approved: ${trimmed}`
          : `Your request to move to "${request.toCourseTitle}" wasn't approved.`,
        linkUrl: "/my-courses",
      },
    }),
  ]);
  return { ok: true };
}
