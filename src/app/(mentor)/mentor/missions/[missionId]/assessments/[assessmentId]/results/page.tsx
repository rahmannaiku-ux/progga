import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { RISK_LEVEL_LABEL } from "@/lib/exam-integrity";

/**
 * PHASE 11 — Results tab for one exam. Reuses AssessmentAttempt /
 * QuestionAnswer directly (no new result model) and links out to the
 * existing grading page (view answers / manual review) and the
 * existing investigate-attempt page (integrity timeline, question
 * timing) rather than re-implementing either here.
 */
export default async function AssessmentResultsPage({
  params,
}: {
  params: { missionId: string; assessmentId: string };
}) {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const assessment = await db.assessment.findUnique({
    where: { id: params.assessmentId },
    select: {
      id: true,
      title: true,
      course: { select: { id: true, teacherId: true } },
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true, course: { select: { teacherId: true } } } } } } } } } },
    },
  });
  if (!assessment) notFound();
  const ownerTeacherId = assessment.course?.teacherId ?? assessment.lesson?.group.chapter.module.course.teacherId;
  if (!isAdmin && ownerTeacherId !== user.id) notFound();

  const attempts = await db.assessmentAttempt.findMany({
    where: { assessmentId: assessment.id, status: { in: ["SUBMITTED", "GRADED", "DISQUALIFIED"] } },
    orderBy: { submittedAt: "desc" },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const graded = attempts.filter((a) => a.status === "GRADED" && a.percentage != null);
  const avgScore =
    graded.length > 0 ? Math.round(graded.reduce((s, a) => s + (a.percentage ?? 0), 0) / graded.length) : null;
  const passRate =
    graded.length > 0
      ? Math.round((graded.filter((a) => a.isPassed).length / graded.length) * 100)
      : null;
  const avgTimeMin =
    attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.timeSpentSec ?? 0), 0) / attempts.length / 60)
      : null;
  const highRiskCount = attempts.filter(
    (a) => a.riskLevel === "HIGH_RISK" || a.riskLevel === "DISQUALIFIED"
  ).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/mentor/missions/${params.missionId}/assessments/${assessment.id}`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to exam
      </Link>
      <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
        {assessment.title} — Results
      </h1>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Attempts" value={attempts.length.toString()} />
        <Stat label="Average score" value={avgScore !== null ? `${avgScore}%` : "—"} />
        <Stat label="Pass rate" value={passRate !== null ? `${passRate}%` : "—"} />
        <Stat label="Avg. time" value={avgTimeMin !== null ? `${avgTimeMin}m` : "—"} />
      </div>
      {highRiskCount > 0 && (
        <p className="mt-2 text-xs font-semibold text-danger">
          {highRiskCount} high-risk/disqualified attempt{highRiskCount === 1 ? "" : "s"} — review recommended.
        </p>
      )}

      {/* Mobile: cards, one per attempt — the desktop table's 8 columns
          (integrity review data included) are too dense to scan via
          horizontal scroll on a phone. */}
      <div className="glass-panel mt-5 p-0 md:hidden">
        {attempts.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No submitted attempts yet.</p>
        ) : (
          <ul className="divide-y divide-border/30">
            {attempts.map((a) => (
              <li key={a.id} className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {a.user.firstName} {a.user.lastName}
                  </p>
                  <span className="shrink-0 text-sm font-mono text-muted-foreground">
                    {a.percentage !== null ? `${Math.round(a.percentage)}%` : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  {a.status === "DISQUALIFIED" ? (
                    <span className="font-semibold text-danger">Disqualified</span>
                  ) : a.isPassed === null ? (
                    <span className="text-muted-foreground">Pending review</span>
                  ) : (
                    <span className={`font-semibold ${a.isPassed ? "text-xp-foreground" : "text-danger"}`}>
                      {a.isPassed ? "Passed" : "Failed"}
                    </span>
                  )}
                  <span className="text-muted-foreground">{RISK_LEVEL_LABEL[a.riskLevel]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Attempt #{a.attemptNumber} · {Math.floor((a.timeSpentSec ?? 0) / 60)}m {(a.timeSpentSec ?? 0) % 60}s
                  {" · "}
                  {a.submittedAt
                    ? new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(a.submittedAt)
                    : "—"}
                </p>
                <Link
                  href={`/mentor/grading/exams/${a.id}/integrity`}
                  className="flex h-11 items-center text-xs font-semibold text-accent hover:underline"
                >
                  View integrity →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <div className="glass-panel mt-5 hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Score</th>
              <th className="px-3 py-2.5 font-medium">Result</th>
              <th className="px-3 py-2.5 font-medium">Time</th>
              <th className="px-3 py-2.5 font-medium">Attempt #</th>
              <th className="px-3 py-2.5 font-medium">Submitted</th>
              <th className="px-3 py-2.5 font-medium">Integrity</th>
              <th className="px-3 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id} className="border-b border-border/30 last:border-0">
                <td className="px-3 py-2.5 text-foreground">{a.user.firstName} {a.user.lastName}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {a.percentage !== null ? `${Math.round(a.percentage)}%` : "Pending"}
                </td>
                <td className="px-3 py-2.5">
                  {a.status === "DISQUALIFIED" ? (
                    <span className="text-xs font-semibold text-danger">Disqualified</span>
                  ) : a.isPassed === null ? (
                    <span className="text-xs text-muted-foreground">Pending review</span>
                  ) : (
                    <span className={`text-xs font-semibold ${a.isPassed ? "text-xp-foreground" : "text-danger"}`}>
                      {a.isPassed ? "Passed" : "Failed"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {Math.floor((a.timeSpentSec ?? 0) / 60)}m {(a.timeSpentSec ?? 0) % 60}s
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">#{a.attemptNumber}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {a.submittedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(a.submittedAt) : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs">{RISK_LEVEL_LABEL[a.riskLevel]}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/mentor/grading/exams/${a.id}/integrity`}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {attempts.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No submitted attempts yet.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2 text-center">
      <p className="font-display text-base font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
