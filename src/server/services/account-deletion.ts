import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { revokeAllActiveSessionsForUser } from "@/lib/auth/session";
import { deleteUserFile } from "@/lib/storage";
import { ACCOUNT_DELETION_GRACE_DAYS, maskPhone } from "@/lib/account-deletion";

/**
 * Account deletion, asked for by the student in Settings.
 *
 * 1. Request: the password is checked, every session is signed out and the account is scheduled
 *    for deletion in ACCOUNT_DELETION_GRACE_DAYS days. Signing in again during that time offers
 *    to restore it (auth-service login()).
 * 2. Purge (purgeDueAccountDeletions, daily cron, or at sign-in once the date has passed): the
 *    person's learning, community, chat and profile data is erased and the User row is
 *    anonymised. What stays is what the platform must keep: payments (receipts), medals issued,
 *    the activity log, mission switches, and `deletedSummary`, a short record admins can see.
 *
 * Only students can delete their own account. Mentors and admins own missions, payments they
 * verified and audit records, so an admin removes those by hand.
 */

export type DeletionRequestResult = { ok: true; scheduledFor: Date } | { ok: false; error: string };

export async function requestAccountDeletion(userId: string, password: string, reason: string | null): Promise<DeletionRequestResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, passwordHash: true, deletionScheduledFor: true },
  });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.role !== "STUDENT") {
    return { ok: false, error: "Mentor and admin accounts can't be deleted from here. Ask a super admin." };
  }
  if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "That password isn't right." };
  }
  if (user.deletionScheduledFor) return { ok: true, scheduledFor: user.deletionScheduledFor };

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        deletionReason: reason?.trim().slice(0, 500) || null,
      },
    }),
    // Orders nobody has paid yet are closed; one already paid stays for an admin to check.
    db.payment.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED" } }),
    db.pushSubscription.deleteMany({ where: { userId } }),
    db.activityLog.create({ data: { userId, action: "UPDATE", entityType: "AccountDeletion", entityId: userId, metadata: { event: "requested" } } }),
  ]);
  await revokeAllActiveSessionsForUser(userId);
  return { ok: true, scheduledFor };
}

/** Undoes a request during the grace period (at sign-in, or by an admin). */
export async function cancelAccountDeletion(userId: string, byUserId: string): Promise<boolean> {
  const updated = await db.user.updateMany({
    where: { id: userId, deletedAt: null, deletionScheduledFor: { not: null } },
    data: { deletionRequestedAt: null, deletionScheduledFor: null, deletionReason: null },
  });
  if (updated.count > 0) {
    await db.activityLog.create({
      data: { userId: byUserId, action: "UPDATE", entityType: "AccountDeletion", entityId: userId, metadata: { event: "cancelled" } },
    });
  }
  return updated.count > 0;
}

/** Erases one account whose grace period is over. Safe to call twice. */
export async function purgeAccount(userId: string, now = new Date()): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      role: true,
      createdAt: true,
      deletionRequestedAt: true,
      deletionScheduledFor: true,
      deletionReason: true,
      deletedAt: true,
      studentProfile: { select: { name: true, district: true, collegeName: true, hscBatch: true } },
      enrollments: { select: { enrolledAt: true, course: { select: { title: true } } } },
      payments: { where: { status: "PAID" }, select: { amountCents: true } },
      uploads: { select: { id: true } },
    },
  });
  if (!user || user.deletedAt || !user.deletionScheduledFor || user.deletionScheduledFor > now) return false;
  if (user.role !== "STUDENT") return false;

  const summary = {
    name: `${user.firstName} ${user.lastName}`.trim() || user.studentProfile?.name || null,
    phone: maskPhone(user.phone),
    district: user.studentProfile?.district ?? null,
    college: user.studentProfile?.collegeName ?? null,
    hscBatch: user.studentProfile?.hscBatch ?? null,
    joinedAt: user.createdAt.toISOString(),
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    deletedAt: now.toISOString(),
    reason: user.deletionReason,
    missions: user.enrollments.map((e) => ({ title: e.course.title, enrolledAt: e.enrolledAt.toISOString() })),
    paidOrders: user.payments.length,
    paidTotalCents: user.payments.reduce((sum, p) => sum + p.amountCents, 0),
  };

  // Stored files first (best effort): their rows are removed with the rest below.
  for (const upload of user.uploads) {
    await deleteUserFile(upload.id).catch((err) => console.error("[account-deletion] could not delete file", upload.id, err));
  }

  const id = user.id;
  await db.$transaction(
    async (tx) => {
      // Community and chat.
      await tx.communityReaction.deleteMany({ where: { userId: id } });
      await tx.communityCommentLike.deleteMany({ where: { userId: id } });
      await tx.communityPollVote.deleteMany({ where: { userId: id } });
      await tx.communitySavedPost.deleteMany({ where: { userId: id } });
      await tx.communityComment.deleteMany({ where: { authorId: id } });
      await tx.communityPost.deleteMany({ where: { authorId: id } });
      await tx.communityFollow.deleteMany({ where: { OR: [{ followerId: id }, { followingId: id }] } });
      await tx.communityGroupJoinRequest.deleteMany({ where: { userId: id } });
      await tx.communityGroupMember.deleteMany({ where: { userId: id } });
      await tx.communityGroup.deleteMany({ where: { ownerId: id } });
      await tx.communityReport.deleteMany({ where: { reporterId: id } });
      await tx.message.deleteMany({ where: { senderId: id } });
      await tx.conversation.deleteMany({ where: { OR: [{ userAId: id }, { userBId: id }] } });
      await tx.groupChatMessage.deleteMany({ where: { senderId: id } });
      await tx.groupChatMember.deleteMany({ where: { userId: id } });
      await tx.discussionPost.deleteMany({ where: { userId: id } });

      // Learning.
      await tx.lessonNote.deleteMany({ where: { userId: id } });
      await tx.bookmark.deleteMany({ where: { userId: id } });
      await tx.wishlist.deleteMany({ where: { userId: id } });
      await tx.lessonProgress.deleteMany({ where: { userId: id } });
      await tx.questionAnswer.deleteMany({ where: { userId: id } });
      await tx.assessmentAttempt.deleteMany({ where: { userId: id } });
      await tx.assignmentSubmission.deleteMany({ where: { userId: id } });
      await tx.liveClassAttendance.deleteMany({ where: { userId: id } });
      await tx.enrollment.deleteMany({ where: { userId: id } });

      // Rewards, coins, notifications, devices.
      await tx.userAchievement.deleteMany({ where: { userId: id } });
      await tx.heroStats.deleteMany({ where: { userId: id } });
      await tx.rewardEvent.deleteMany({ where: { userId: id } });
      await tx.birthdayReward.deleteMany({ where: { userId: id } });
      await tx.coinPurchase.deleteMany({ where: { userId: id } });
      await tx.coinRewardLot.deleteMany({ where: { userId: id } });
      await tx.proggyCoinTransaction.deleteMany({ where: { userId: id } });
      await tx.notificationDelivery.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.pushSubscription.deleteMany({ where: { userId: id } });
      await tx.telegramLinkToken.deleteMany({ where: { userId: id } });
      await tx.telegramLink.deleteMany({ where: { userId: id } });
      await tx.bugReport.deleteMany({ where: { userId: id } });
      await tx.upload.deleteMany({ where: { uploaderId: id } });

      // Sign-in and profile.
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.otp.deleteMany({ where: { userId: id } });
      await tx.studentProfile.deleteMany({ where: { userId: id } });

      await tx.user.update({
        where: { id },
        data: {
          firstName: "Deleted",
          lastName: "account",
          phone: null,
          email: null,
          passwordHash: null,
          phoneVerified: false,
          avatarUrl: null,
          bio: null,
          headline: null,
          username: null,
          clerkId: null,
          isActive: false,
          communityPrivate: true,
          deletedAt: now,
          deletionScheduledFor: null,
          deletedSummary: summary,
        },
      });
      await tx.activityLog.create({
        data: { userId: id, action: "DELETE", entityType: "AccountDeletion", entityId: id, metadata: { event: "purged" } },
      });
    },
    { timeout: 60_000 }
  );
  return true;
}

/** The daily sweep: erases every account whose grace period has ended. */
export async function purgeDueAccountDeletions(now = new Date(), limit = 50): Promise<number> {
  const due = await db.user.findMany({
    where: { deletedAt: null, deletionScheduledFor: { lte: now } },
    select: { id: true },
    take: limit,
  });
  let purged = 0;
  for (const { id } of due) {
    try {
      if (await purgeAccount(id, now)) purged++;
    } catch (err) {
      console.error("[account-deletion] purge failed", id, err);
    }
  }
  return purged;
}
