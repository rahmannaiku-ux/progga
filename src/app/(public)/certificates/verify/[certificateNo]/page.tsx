import Link from "next/link";
import { CircleAlert, ShieldCheck, ShieldX } from "lucide-react";
import { db } from "@/lib/db/client";
import { normalizeCertificateNo } from "@/lib/certificate/certificate-no";
import { formatDhakaDate } from "@/lib/timezone";

export const metadata = {
  title: "Verify a Certificate",
  robots: { index: false, follow: false },
};

// Always read live: a revoked certificate must stop verifying immediately.
export const dynamic = "force-dynamic";

export default async function VerifyCertificatePage({
  params,
}: {
  params: { certificateNo: string };
}) {
  const certificateNo = normalizeCertificateNo(decodeURIComponent(params.certificateNo)).slice(0, 40);

  // Only what is printed on the certificate itself: name, mission, date.
  // No email, phone, user ID or anything else about the student.
  const certificate = await db.certificate.findUnique({
    where: { certificateNo },
    select: {
      status: true,
      issuedAt: true,
      user: { select: { firstName: true, lastName: true } },
      course: { select: { title: true } },
    },
  });

  const valid = certificate?.status === "ISSUED";
  const revoked = certificate?.status === "REVOKED";

  return (
    <div className="container max-w-lg py-14">
      <div className="comic-panel bg-surface p-6 text-center">
        {valid ? (
          <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
        ) : revoked ? (
          <ShieldX className="mx-auto h-12 w-12 text-danger" />
        ) : (
          <CircleAlert className="mx-auto h-12 w-12 text-muted-foreground" />
        )}

        <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">
          {valid ? "Certificate verified" : revoked ? "Certificate revoked" : "Certificate not found"}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{certificateNo}</p>

        {valid && certificate ? (
          <dl className="mt-6 space-y-4 text-left">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Awarded to</dt>
              <dd className="font-display text-lg font-bold text-foreground">
                {`${certificate.user.firstName} ${certificate.user.lastName}`.trim()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                For completing the mission
              </dt>
              <dd className="font-display text-lg font-bold text-primary">{certificate.course.title}</dd>
            </div>
            {certificate.issuedAt && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Issued on</dt>
                <dd className="text-foreground">{formatDhakaDate(certificate.issuedAt)} (UTC+06:00)</dd>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This certificate was issued by Proggaa and is currently valid.
            </p>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {revoked
              ? "This certificate was issued by Proggaa but has since been revoked, so it is no longer valid."
              : "We couldn't find a certificate with this ID. Check for typos, or contact the person who shared it."}
          </p>
        )}

        <Link href="/certificates/verify" className="mt-6 inline-block text-sm font-bold text-primary">
          Verify another certificate
        </Link>
      </div>
    </div>
  );
}
