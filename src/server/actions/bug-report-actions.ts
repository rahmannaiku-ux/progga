"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { BugReportStatus } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveUser, requireAdminUser } from "@/server/actions/require-user";
import { BUG_REPORT_STATUSES, MAX_BUG_REPORT_IMAGES } from "@/lib/bug-reports";

type ActionResult = { ok: true } | { ok: false; error: string };

// Returned rather than thrown: Next.js replaces thrown Server Action
// messages with a generic error in production, so the form could never
// tell the student what to fix.
function fail(error: string): ActionResult {
  return { ok: false, error };
}

const submitSchema = z.object({
  title: z.string().trim().min(5, "Give the bug a short title (at least 5 characters).").max(150),
  description: z
    .string()
    .trim()
    .min(10, "Describe what happened (at least 10 characters).")
    .max(5000, "Description is too long (max 5000 characters)."),
  pageUrl: z.string().trim().max(500).optional(),
  uploadIds: z.array(z.string().min(1)).max(MAX_BUG_REPORT_IMAGES, `Attach at most ${MAX_BUG_REPORT_IMAGES} images.`),
});

export async function submitBugReport(input: z.input<typeof submitSchema>): Promise<ActionResult> {
  let user;
  try {
    user = await requireActiveUser();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Please sign in again.");
  }

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { title, description, pageUrl, uploadIds } = parsed.data;

  const rl = await checkRateLimit("write", user.id);
  if (!rl.success) return fail("You're sending reports too quickly. Please try again in a moment.");

  // Only the reporter's own, not-yet-attached bug-report screenshots may
  // be linked; anything else is an ID the client made up or reused.
  const uniqueIds = Array.from(new Set(uploadIds));
  if (uniqueIds.length > 0) {
    const uploads = await db.upload.findMany({
      where: { id: { in: uniqueIds }, uploaderId: user.id, context: "BUG_REPORT", bugReportImage: null },
      select: { id: true },
    });
    if (uploads.length !== uniqueIds.length) {
      return fail("One of the images couldn't be attached. Please remove it and upload it again.");
    }
  }

  const userAgent = headers().get("user-agent")?.slice(0, 500) ?? null;

  const report = await db.$transaction(async (tx) => {
    const created = await tx.bugReport.create({
      data: {
        userId: user.id,
        title,
        description,
        pageUrl: pageUrl || null,
        userAgent,
        images: { create: uniqueIds.map((uploadId) => ({ uploadId })) },
      },
    });
    if (uniqueIds.length > 0) {
      await tx.upload.updateMany({ where: { id: { in: uniqueIds } }, data: { consumedAt: new Date() } });
    }
    return created;
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
        title: "New bug report",
        body: title,
        linkUrl: `/admin/bug-reports?open=${report.id}`,
      })),
    });
  }

  revalidatePath("/support");
  revalidatePath("/admin/bug-reports");
  return { ok: true };
}

const STATUS_LABEL: Record<BugReportStatus, string> = {
  OPEN: "open",
  IN_PROGRESS: "being worked on",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

export async function updateBugReport(input: {
  id: string;
  status: BugReportStatus;
  adminNote: string;
}): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdminUser();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Admin access required.");
  }
  if (!BUG_REPORT_STATUSES.includes(input.status)) return fail("Unknown status.");
  const adminNote = input.adminNote.trim().slice(0, 5000);

  const existing = await db.bugReport.findUnique({ where: { id: input.id } });
  if (!existing) return fail("Bug report not found.");

  const isDone = input.status === "RESOLVED" || input.status === "CLOSED";
  await db.bugReport.update({
    where: { id: input.id },
    data: {
      status: input.status,
      adminNote: adminNote || null,
      resolvedAt: isDone ? existing.resolvedAt ?? new Date() : null,
    },
  });

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: "UPDATE",
      entityType: "BugReport",
      entityId: input.id,
      metadata: { oldValue: existing.status, newValue: input.status },
    },
  });

  // Tell the reporter when the status actually changes; a note-only
  // edit isn't worth a notification.
  if (existing.status !== input.status) {
    await db.notification.create({
      data: {
        userId: existing.userId,
        type: "SYSTEM",
        title: `Your bug report is ${STATUS_LABEL[input.status]}`,
        body: adminNote ? `${existing.title}: ${adminNote}` : existing.title,
        linkUrl: "/support#my-reports",
      },
    });
  }

  revalidatePath("/admin/bug-reports");
  revalidatePath("/support");
  return { ok: true };
}
