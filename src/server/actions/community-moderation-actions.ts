"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { setUserSuspendedCore } from "@/server/services/admin-tools";
import { requireAdminUser } from "./require-user";

// ---------------------------------------------------------------------
// Community moderation, for admins only. It reuses the LMS's existing
// account suspension (setUserSuspendedCore) and audit log (ActivityLog)
// rather than keeping its own. Every decision records who made it and why.
// ---------------------------------------------------------------------

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export type ModerationDecision = "DISMISS" | "HIDE" | "REMOVE" | "SUSPEND_AUTHOR";

/**
 * Resolves a report.
 * - DISMISS: nothing wrong; the content stays.
 * - HIDE: the post or comment disappears for everyone but its author and staff.
 * - REMOVE: the post or comment is deleted.
 * - SUSPEND_AUTHOR: hides the content and suspends the account that posted
 *   it (or the reported profile), through the existing admin suspension.
 *
 * An admin can't act on a report they filed themselves, or on a report
 * about their own content.
 */
export async function resolveReport(reportId: string, decision: ModerationDecision, note: string): Promise<Result> {
  const admin = await requireAdminUser();
  const reason = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (!["DISMISS", "HIDE", "REMOVE", "SUSPEND_AUTHOR"].includes(decision)) return fail("Choose what to do.");
  if (decision !== "DISMISS" && reason.length < 3) return fail("Add a short reason for this decision.");

  const report = await db.communityReport.findUnique({
    where: { id: String(reportId) },
    select: {
      id: true,
      status: true,
      reporterId: true,
      targetType: true,
      postId: true,
      commentId: true,
      targetUserId: true,
      post: { select: { authorId: true } },
      comment: { select: { authorId: true, postId: true } },
    },
  });
  if (!report) return fail("That report no longer exists.");
  if (report.status !== "OPEN") return fail("That report was already handled.");
  if (report.reporterId === admin.id) return fail("You filed this report, so another admin has to review it.");

  const authorId = report.post?.authorId ?? report.comment?.authorId ?? report.targetUserId ?? null;
  if (authorId === admin.id) return fail("This report is about you, so another admin has to review it.");

  if (decision === "HIDE" || decision === "SUSPEND_AUTHOR") {
    if (report.postId) {
      await db.communityPost.update({ where: { id: report.postId }, data: { isHidden: true, hiddenReason: reason } });
    } else if (report.commentId) {
      await db.communityComment.update({
        where: { id: report.commentId },
        data: { isHidden: true, hiddenReason: reason },
      });
    } else if (decision === "HIDE") {
      return fail("A profile can't be hidden. Dismiss the report or suspend the account.");
    }
  }
  if (decision === "REMOVE") {
    if (report.targetType === "PROFILE") return fail("A profile can't be removed here. Suspend the account instead.");
  }
  if (decision === "SUSPEND_AUTHOR") {
    if (!authorId) return fail("Couldn't find the account to suspend.");
    try {
      await setUserSuspendedCore(admin, authorId, true);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Couldn't suspend that account.");
    }
  }

  // Close this report and any other open report about the same thing.
  await db.communityReport.updateMany({
    where: {
      status: "OPEN",
      targetType: report.targetType,
      targetKey: report.postId ?? report.commentId ?? report.targetUserId ?? "",
    },
    data: {
      status: decision === "DISMISS" ? "DISMISSED" : "ACTIONED",
      reviewedById: admin.id,
      reviewNote: `${decision}${reason ? `: ${reason}` : ""}`,
      reviewedAt: new Date(),
    },
  });

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: decision === "REMOVE" ? "DELETE" : "UPDATE",
      entityType: "CommunityReport",
      entityId: report.id,
      metadata: { decision, reason, targetType: report.targetType, authorId },
    },
  });

  if (authorId && decision !== "DISMISS") {
    await db.notification
      .create({
        data: {
          userId: authorId,
          type: "COMMUNITY_MODERATION",
          title:
            decision === "SUSPEND_AUTHOR"
              ? "Your account was suspended by a moderator"
              : "A moderator removed something you posted",
          body: reason,
          linkUrl: "/community",
        },
      })
      .catch(() => {});
  }

  // Last, because deleting the content also deletes its report rows
  // (cascade). The decision and reason are already in the audit log above.
  if (decision === "REMOVE") {
    if (report.postId) await db.communityPost.deleteMany({ where: { id: report.postId } });
    if (report.commentId) await db.communityComment.deleteMany({ where: { id: report.commentId } });
  }

  revalidatePath("/admin/community");
  revalidatePath("/community", "layout");
  return { ok: true };
}

/** Un-hides a post or comment a moderator hid by mistake. */
export async function restoreContent(kind: "POST" | "COMMENT", id: string): Promise<Result> {
  const admin = await requireAdminUser();
  if (kind === "POST") {
    await db.communityPost.updateMany({ where: { id: String(id) }, data: { isHidden: false, hiddenReason: null } });
  } else if (kind === "COMMENT") {
    await db.communityComment.updateMany({ where: { id: String(id) }, data: { isHidden: false, hiddenReason: null } });
  } else {
    return fail("Unknown content type.");
  }
  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: `Community${kind === "POST" ? "Post" : "Comment"}`, entityId: String(id), metadata: { restored: true } },
  });
  revalidatePath("/admin/community");
  revalidatePath("/community", "layout");
  return { ok: true };
}
