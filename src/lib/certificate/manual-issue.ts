import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";
import { generateCertificateNo } from "@/lib/certificate/certificate-no";
import { findUserByIdentifier, userLabel } from "@/lib/auth/find-user-by-identifier";
import { logActivity } from "@/server/actions/admin-actions";

export type IssueCertificateActionResult =
  | ({ ok: true } & ManualIssueResult)
  | { ok: false; error: string };

export type ManualIssueResult = {
  alreadyIssued: boolean;
  /** False when the PDF/email step failed and the certificate is still PENDING. */
  issued: boolean;
  studentLabel: string;
  courseTitle: string;
};

/**
 * Shared by certificate-actions.ts (admin: any course) and
 * mentor-actions.ts (own courses only, via `requireCourseOwnerId`).
 * Lets staff issue a certificate without the student finishing every
 * lesson (offline completion, exceptions), and re-issue a revoked one.
 * The student must already be enrolled — grant access first otherwise.
 */
async function issueCore({
  issuerId,
  email,
  courseId,
  requireCourseOwnerId,
}: {
  issuerId: string;
  email: string;
  courseId: string;
  requireCourseOwnerId?: string;
}): Promise<ManualIssueResult> {
  if (!courseId) throw new Error("Select a mission.");
  const student = await findUserByIdentifier(email);

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });
  if (!course) throw new Error("That mission doesn't exist.");
  if (requireCourseOwnerId && course.teacherId !== requireCourseOwnerId) {
    throw new Error("You can only issue medals for your own missions.");
  }

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: student.id, courseId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw new Error("That student isn't enrolled in this mission. Grant access first.");
  }

  const base = { studentLabel: userLabel(student), courseTitle: course.title };

  const existing = await db.certificate.findUnique({
    where: { userId_courseId: { userId: student.id, courseId } },
  });
  if (existing?.status === "ISSUED") {
    return { ...base, alreadyIssued: true, issued: true };
  }

  const certificate = existing
    ? await db.certificate.update({
        where: { id: existing.id },
        data: { status: "PENDING", revokedAt: null },
      })
    : await db.certificate.create({
        data: {
          userId: student.id,
          courseId,
          certificateNo: generateCertificateNo(),
          status: "PENDING",
        },
      });

  // issueCertificate claims each certificate once through a RewardEvent
  // row; a revoked or previously-failed certificate still has that claim,
  // so clear it or the re-issue would silently return early.
  await db.rewardEvent.deleteMany({
    where: {
      sourceType: "CERTIFICATE_ISSUANCE",
      sourceId: certificate.id,
      rewardType: "CERTIFICATE_ISSUED",
    },
  });

  await issueCertificate(certificate.id);

  const after = await db.certificate.findUnique({
    where: { id: certificate.id },
    select: { status: true },
  });
  const issued = after?.status === "ISSUED";

  await logActivity(issuerId, "UPDATE", "Certificate", certificate.id, {
    status: issued ? "ISSUED" : "PENDING",
    method: requireCourseOwnerId ? "mentor_issue" : "admin_issue",
    issuedTo: student.id,
    reissued: Boolean(existing),
  });

  if (issued) {
    await db.notification.create({
      data: {
        userId: student.id,
        type: "CERTIFICATE_ISSUED",
        title: "Your medal is ready!",
        body: `You earned a medal for "${course.title}".`,
        linkUrl: `/medals`,
      },
    });
  }

  return { ...base, alreadyIssued: false, issued };
}

/**
 * Same as above but returns `{ ok: false, error }` instead of throwing:
 * production hides thrown Server Action messages, and these are
 * user-facing validation errors.
 */
export async function issueCertificateManuallyCore(
  args: Parameters<typeof issueCore>[0]
): Promise<IssueCertificateActionResult> {
  try {
    return { ok: true, ...(await issueCore(args)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to issue medal." };
  }
}
