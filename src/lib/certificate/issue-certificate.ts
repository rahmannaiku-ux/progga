import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { renderCertificatePdf } from "@/lib/certificate/generate-certificate";
import { formatDhakaDate } from "@/lib/timezone";
import { sendTemplatedEmail } from "@/lib/email/send-email";
import { uploadUserFile } from "@/lib/storage";

export async function issueCertificate(certificateId: string) {
  const certificate = await db.certificate.findUnique({
    where: { id: certificateId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      course: { select: { title: true, teacher: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!certificate || certificate.status === "ISSUED") return;

  // Atomically claim this issuance before doing any of the expensive
  // (PDF render, file upload, email) work below. The status check above
  // is a plain read — two concurrent calls (recalcEnrollmentProgress
  // firing twice for near-simultaneous lesson completions, a retried
  // request, etc.) could both observe PENDING and both proceed, which
  // would upload two PDFs and send two "your medal is ready" emails for
  // the same certificate. Reusing RewardEvent's unique constraint here
  // (rather than adding a new CertificateStatus enum value just for
  // this) gets the same real atomicity from the database: only one
  // concurrent caller can successfully insert this row.
  try {
    await db.rewardEvent.create({
      data: {
        userId: certificate.userId,
        sourceType: "CERTIFICATE_ISSUANCE",
        sourceId: certificateId,
        rewardType: "CERTIFICATE_ISSUED",
        amount: 0,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return; // another request already claimed this issuance
    }
    throw err;
  }

  try {
    // Certificates are stored via the shared storage abstraction, which
    // uses Google Drive when the admin has connected it and falls back
    // to UploadThing otherwise — so this no longer hard-requires
    // UPLOADTHING_SECRET the way it used to. It only bails out early if
    // *neither* provider is usable (see storeViaUploadThing's own
    // "storage unavailable" error, thrown when Drive isn't connected
    // and UPLOADTHING_SECRET is also missing).
    const pdfBuffer = await renderCertificatePdf({
      studentName: `${certificate.user.firstName} ${certificate.user.lastName}`.trim(),
      courseTitle: certificate.course.title,
      mentorName: `${certificate.course.teacher.firstName} ${certificate.course.teacher.lastName}`.trim(),
      issuedDate: formatDhakaDate(new Date()),
      certificateNo: certificate.certificateNo,
    });

    const result = await uploadUserFile({
      uploaderId: certificate.userId,
      context: "CERTIFICATE",
      buffer: pdfBuffer,
      filename: `${certificate.certificateNo}.pdf`,
      mimeType: "application/pdf",
    });

    await db.certificate.update({
      where: { id: certificateId },
      data: { status: "ISSUED", issuedAt: new Date(), pdfUrl: result.url },
    });

    if (certificate.user.email) {
      await sendTemplatedEmail(
        "certificate-issued",
        certificate.user.email,
        { courseTitle: certificate.course.title },
        {
          subject: "Your medal is ready 🏅",
          bodyHtml:
            "<p>Congratulations on completing {{courseTitle}}! Your certificate is ready in your Medals tab.</p>",
        }
      );
    }
  } catch (err) {
    // Certificate stays PENDING; the medals page offers a manual retry
    // rather than silently failing the enrollment-completion flow.
    console.error(`Certificate ${certificateId} issuance failed:`, err);
  }
}
