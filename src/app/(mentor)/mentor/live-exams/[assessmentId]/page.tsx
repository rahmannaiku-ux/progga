import Link from "next/link";
import { notFound } from "next/navigation";
import { Radio, Clock3 } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { RISK_LEVEL_LABEL } from "@/lib/exam-integrity";
import { getAntiCollusionAnalysis } from "@/server/services/exam-analytics";

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "Taking now",
  SUBMITTED: "Submitted",
  AUTO_SUBMITTED: "Auto-submitted",
  GRADED: "Submitted",
  DISQUALIFIED: "Disqualified",
};

const RISK_ORDER: Record<string, number> = { DISQUALIFIED: 0, HIGH_RISK: 1, REVIEW: 2, NORMAL: 3 };
type Filter = "highest-risk" | "highest-score" | "submitted" | "in-progress" | "disqualified" | undefined;

/**
 * Per-student live monitoring table. Teacher-only, scoped to their own
 * course's roster — deliberately does NOT expose anything a student
 * wouldn't already know about themselves (their own answers, etc.) to
 * anyone else; this shows status/timing only, matching the spec's
 * example table (Student, Started, Status, Submitted, Time remaining).
 *
 * PHASE 17 — reused as the Exam Monitoring Dashboard rather than
 * building a second page: it already has the roster + attempt join
 * this needs, so an integrity/risk column and the risk-based filters
 * are added directly to it instead of duplicating the query elsewhere.
 */
export default async function MonitorLiveExamPage({
  params,
  searchParams,
}: {
  params: { assessmentId: string };
  searchParams: { filter?: Filter };
}) {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const assessment = await db.assessment.findUnique({
    where: { id: params.assessmentId },
    include: { course: { select: { id: true, title: true, teacherId: true } } },
  });
  if (!assessment || !assessment.course) notFound();
  if (!isAdmin && assessment.course.teacherId !== user.id) notFound();

  const [roster, attempts, collusionPairs] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: assessment.course.id, status: "ACTIVE" },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.assessmentAttempt.findMany({
      where: { assessmentId: assessment.id },
      orderBy: { startedAt: "desc" },
    }),
    getAntiCollusionAnalysis(assessment.id),
  ]);

  const attemptByUser = new Map(attempts.map((a) => [a.userId, a]));
  const now = Date.now();

  let rows = roster.map((e) => {
    const attempt = attemptByUser.get(e.user.id);
    let remainingLabel = "—";
    if (attempt?.status === "IN_PROGRESS" && assessment.timeLimitSeconds) {
      const deadline = attempt.startedAt.getTime() + assessment.timeLimitSeconds * 1000;
      const remainingMs = deadline - now;
      remainingLabel =
        remainingMs > 0 ? `${Math.ceil(remainingMs / 60000)} min left` : "Time's up (pending auto-submit)";
    }
    return {
      studentId: e.user.id,
      attemptId: attempt?.id ?? null,
      name: `${e.user.firstName} ${e.user.lastName}`,
      status: attempt ? STATUS_LABEL[attempt.status] ?? attempt.status : "Not started",
      rawStatus: attempt?.status ?? null,
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
      percentage: attempt?.percentage ?? null,
      riskLevel: attempt?.riskLevel ?? null,
      remainingLabel,
      isTakingNow: attempt?.status === "IN_PROGRESS",
    };
  });

  const filter = searchParams.filter;
  if (filter === "submitted") rows = rows.filter((r) => r.submittedAt);
  else if (filter === "in-progress") rows = rows.filter((r) => r.isTakingNow);
  else if (filter === "disqualified") rows = rows.filter((r) => r.rawStatus === "DISQUALIFIED");
  else if (filter === "highest-risk") {
    rows = [...rows].sort((a, b) => (RISK_ORDER[a.riskLevel ?? "NORMAL"] ?? 9) - (RISK_ORDER[b.riskLevel ?? "NORMAL"] ?? 9));
  } else if (filter === "highest-score") {
    rows = [...rows].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));
  }

  const takingNow = rows.filter((r) => r.isTakingNow).length;
  const submitted = rows.filter((r) => r.submittedAt).length;
  const notStarted = rows.filter((r) => !r.startedAt).length;

  const filters: { key: Filter; label: string }[] = [
    { key: undefined, label: "All" },
    { key: "highest-risk", label: "Highest risk" },
    { key: "highest-score", label: "Highest score" },
    { key: "submitted", label: "Submitted" },
    { key: "in-progress", label: "In progress" },
    { key: "disqualified", label: "Disqualified" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/mentor/live-exams" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to Live Exams
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <Radio className="h-6 w-6 text-danger" />
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{assessment.title}</h1>
          <p className="text-xs text-muted-foreground">{assessment.course.title}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-3 text-center text-xs">
        <Stat label="Roster" value={rows.length} />
        <Stat label="Taking now" value={takingNow} />
        <Stat label="Submitted" value={submitted} />
        <Stat label="Not started" value={notStarted} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `?filter=${f.key}` : "?"}
            className={
              "rounded-full border-[2px] px-3 py-1 text-xs font-semibold transition-colors " +
              (filter === f.key || (!filter && !f.key)
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Mobile: cards, one per student, preserving every status/risk/
          time-remaining signal a proctor needs while monitoring live. */}
      <div className="glass-panel mt-4 p-0 md:hidden">
        <ul className="divide-y divide-border/30">
          {rows.map((r) => (
            <li key={r.studentId} className="space-y-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-foreground">{r.name}</p>
                <span className="shrink-0 text-sm font-mono text-muted-foreground">
                  {r.percentage !== null ? `${Math.round(r.percentage)}%` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (r.isTakingNow
                      ? "bg-xp/15 text-xp-foreground"
                      : r.submittedAt
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground")
                  }
                >
                  {r.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.riskLevel ? RISK_LEVEL_LABEL[r.riskLevel as keyof typeof RISK_LEVEL_LABEL] : "—"}
                </span>
              </div>
              {r.isTakingNow && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> {r.remainingLabel}
                </p>
              )}
              {r.attemptId && (
                <Link
                  href={`/mentor/grading/exams/${r.attemptId}/integrity`}
                  className="flex h-11 items-center text-xs font-semibold text-accent hover:underline"
                >
                  Investigate →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <div className="glass-panel mt-4 hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Integrity</th>
              <th className="px-4 py-3 font-medium">Time remaining</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className="border-b border-border/30 last:border-0">
                <td className="px-4 py-3 text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.percentage !== null ? `${Math.round(r.percentage)}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-semibold " +
                      (r.isTakingNow
                        ? "bg-xp/15 text-xp-foreground"
                        : r.submittedAt
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.riskLevel ? RISK_LEVEL_LABEL[r.riskLevel as keyof typeof RISK_LEVEL_LABEL] : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.isTakingNow && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {r.remainingLabel}
                    </span>
                  )}
                  {!r.isTakingNow && "—"}
                </td>
                <td className="px-4 py-3">
                  {r.attemptId && (
                    <Link
                      href={`/mentor/grading/exams/${r.attemptId}/integrity`}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Investigate →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PHASE 19 — surfaced as a review prompt, never an accusation;
          see getAntiCollusionAnalysis()'s docstring for the threshold. */}
      {collusionPairs.skipped && (
        <p className="mt-6 text-xs text-muted-foreground">
          Similar-answer-pattern analysis is skipped for exams with this many graded attempts.
        </p>
      )}
      {collusionPairs.pairs.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Similar answer patterns</h2>
          <div className="glass-panel divide-y divide-border/40 p-0">
            {collusionPairs.pairs.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <span className="text-foreground">
                  {p.userAName} &amp; {p.userBName}
                </span>
                <span className="text-muted-foreground">
                  Similarity {p.similarityPct}% · Review recommended
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="font-display text-base font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
