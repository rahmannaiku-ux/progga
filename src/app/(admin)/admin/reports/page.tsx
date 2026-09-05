import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";

export default async function AdminReportsPage() {
  await requireRole("ADMIN");

  const [
    totalEnrollments,
    completedEnrollments,
    totalAttempts,
    passedAttempts,
    totalSubmissions,
    gradedSubmissions,
  ] = await Promise.all([
    db.enrollment.count(),
    db.enrollment.count({ where: { status: "COMPLETED" } }),
    db.assessmentAttempt.count({ where: { status: "GRADED" } }),
    db.assessmentAttempt.count({ where: { status: "GRADED", isPassed: true } }),
    db.assignmentSubmission.count(),
    db.assignmentSubmission.count({ where: { status: "GRADED" } }),
  ]);

  const completionRate = totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;
  const gradingRate = totalSubmissions > 0 ? Math.round((gradedSubmissions / totalSubmissions) * 100) : 0;

  const metrics = [
    { label: "Mission completion rate", value: `${completionRate}%`, sub: `${completedEnrollments} / ${totalEnrollments} enrollments` },
    { label: "Encounter pass rate", value: `${passRate}%`, sub: `${passedAttempts} / ${totalAttempts} graded attempts` },
    { label: "Assignment grading rate", value: `${gradingRate}%`, sub: `${gradedSubmissions} / ${totalSubmissions} submissions` },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Reports
        </h1>
        <a
          href="/api/admin/reports"
          className="comic-btn flex items-center gap-1.5 bg-surface px-4 py-2 text-xs font-bold text-foreground"
        >
          <Download className="h-3.5 w-3.5" /> Export JSON
        </a>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="comic-panel bg-surface p-5">
            <p className="font-display text-2xl font-extrabold text-accent">{m.value}</p>
            <p className="mt-1 text-xs font-semibold text-foreground">{m.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        The JSON export is a read-only snapshot for reporting and archival —
        it isn't a substitute for a database-level backup. See
        Backup & Restore for the distinction.
      </p>
    </div>
  );
}
