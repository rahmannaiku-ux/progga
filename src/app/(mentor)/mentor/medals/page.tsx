import { Award } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { IssueCertificateForm } from "@/components/shared/issue-certificate-form";
import { issueCertificateAsMentor } from "@/server/actions/mentor-actions";

const statusVariant = {
  ISSUED: "accent",
  PENDING: "outline",
  REVOKED: "default",
} as const;

export default async function MentorMedalsPage() {
  const user = await getCurrentUser();

  // Same scoping as the action: a TEACHER only sees their own missions;
  // ADMIN/SUPER_ADMIN visiting the mentor section see every mission.
  const courseFilter = user.role === "TEACHER" ? { teacherId: user.id } : undefined;
  const [courses, certificates] = await Promise.all([
    db.course.findMany({
      where: courseFilter,
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.certificate.findMany({
      where: { course: courseFilter },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { firstName: true, lastName: true } },
        course: { select: { title: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <Award className="h-6 w-6" /> Issue Medals
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Award a medal (certificate) to an enrolled hero in one of your missions without waiting for
        them to finish every patrol. They get a notification and an email.
      </p>

      <div className="mt-6">
        <IssueCertificateForm courses={courses} action={issueCertificateAsMentor} />
      </div>

      <h2 className="mt-8 font-display text-lg font-bold text-foreground">Recent medals</h2>
      <div className="glass-panel mt-3">
        {certificates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No medals yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {certificates.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {c.user.firstName} {c.user.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.course.title}</p>
                </div>
                <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
