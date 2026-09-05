import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { RevokeCertificateButton } from "@/components/admin-dashboard/revoke-certificate-button";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const statusVariant = {
  ISSUED: "accent",
  PENDING: "outline",
  REVOKED: "default",
} as const;

export default async function AdminMedalsPage() {
  await requireRole("ADMIN");

  const certificates = await db.certificate.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { firstName: true, lastName: true } },
      course: { select: { title: true } },
    },
  });

  return (
    <StaggerContainer>
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Medals (Certificates)
        </h1>
      </StaggerItem>

      {/* Mobile: cards. Only 4 real fields, but "Certificate #" is a
          long monospace string that would force horizontal scroll
          alongside the other columns below md. */}
      <StaggerItem className="glass-panel mt-6 md:hidden">
        {certificates.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No certificates issued yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {certificates.map((c) => (
              <li key={c.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.user.firstName} {c.user.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{c.course.title}</p>
                  </div>
                  <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {c.certificateNo}
                  </p>
                  {c.status === "ISSUED" && <RevokeCertificateButton certificateId={c.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </StaggerItem>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <StaggerItem className="glass-panel mt-6 hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Hero</th>
              <th className="p-4 font-medium">Mission</th>
              <th className="p-4 font-medium">Certificate #</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((c) => (
              <tr key={c.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-surface/60">
                <td className="p-4 text-foreground">
                  {c.user.firstName} {c.user.lastName}
                </td>
                <td className="p-4 text-muted-foreground">{c.course.title}</td>
                <td className="p-4 font-mono text-xs text-muted-foreground">
                  {c.certificateNo}
                </td>
                <td className="p-4">
                  <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
                </td>
                <td className="p-4">
                  {c.status === "ISSUED" && <RevokeCertificateButton certificateId={c.id} />}
                </td>
              </tr>
            ))}
            {certificates.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No certificates issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </StaggerItem>
    </StaggerContainer>
  );
}
