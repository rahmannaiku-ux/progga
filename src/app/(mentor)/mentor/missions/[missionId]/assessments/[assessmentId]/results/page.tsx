import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { isCourseMentor } from "@/lib/auth/course-access";
import { getMissionsBase } from "@/lib/mission-paths";
import { RISK_LEVEL_LABEL } from "@/lib/exam-integrity";
import { attemptDeadline } from "@/lib/exam-attempt";
import { formatDhakaDateTime } from "@/lib/timezone";
import { closeExpiredAttempts } from "@/server/services/attempt-grading";
import { AttemptTools, RegradeButton } from "@/components/mentor-dashboard/attempt-tools";

/**
 * PHASE 11 — Results tab for one exam. Reuses AssessmentAttempt /
 * QuestionAnswer directly (no new result model) and links out to the
 * existing grading page (view answers / manual review) and the
 * existing investigate-attempt page (integrity timeline, question
 * timing) rather than re-implementing either here.
 */
export default async function AssessmentResultsPage(
  props: {
    params: Promise<{ missionId: string; assessmentId: string }>;
  }
) {
  const params = await props.params;
  const missionsBase = await getMissionsBase();
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const assessment = await db.assessment.findUnique({
    where: { id: params.assessmentId },
    select: {
      id: true,
      title: true,
      timeLimitSeconds: true,
      autoSubmitOnExpiry: true,
      course: { select: { id: true, teacherId: true } },
      chapter: { select: { module: { select: { courseId: true } } } },
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true, course: { select: { teacherId: true } } } } } } } } } },
    },
  });
  if (!assessment) notFound();
  const ownerCourseId =
    assessment.course?.id ?? assessment.chapter?.module.courseId ?? assessment.lesson?.group.chapter.module.courseId;
  if (!isAdmin && !(ownerCourseId && (await isCourseMentor(ownerCourseId, user.id)))) notFound();

  // Attempts whose time ran out with nobody on the page belong in the
  // results below, not in the "in progress" list.
  await closeExpiredAttempts({ assessmentId: assessment.id });

  const allAttempts = await db.assessmentAttempt.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { submittedAt: "desc" },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const attempts = allAttempts.filter((a) => a.status === "SUBMITTED" || a.status === "GRADED");
  const running = allAttempts.filter((a) => a.status === "IN_PROGRESS");
  const timed = Boolean(assessment.timeLimitSeconds);

  // A student's newest attempt is the only one that can be reopened.
  const latestNumber = new Map<string, number>();
  for (const a of allAttempts) {
    latestNumber.set(a.userId, Math.max(latestNumber.get(a.userId) ?? 0, a.attemptNumber));
  }

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

  const resultOf = (a: (typeof attempts)[number]) =>
    a.wasDisqualified
      ? { label: "Disqualified", className: "text-danger" }
      : a.isPassed === null
        ? { label: "Pending review", className: "text-muted-foreground" }
        : a.isPassed
          ? { label: "Passed", className: "text-xp-foreground" }
          : { label: "Failed", className: "text-danger" };
  const timeOf = (a: (typeof attempts)[number]) =>
    `${Math.floor((a.timeSpentSec ?? 0) / 60)}m ${(a.timeSpentSec ?? 0) % 60}s`;
  const tools = (a: (typeof allAttempts)[number]) => (
    <AttemptTools
      attemptId={a.id}
      inProgress={a.status === "IN_PROGRESS"}
      timed={timed}
      wasDisqualified={a.wasDisqualified}
      isLatest={latestNumber.get(a.userId) === a.attemptNumber}
    />
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`${missionsBase}/${params.missionId}/assessments/${assessment.id}`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to exam
      </Link>
      <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
        {assessment.title} — Results
      </h1>

      <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-2">
        <a
          href={`/api/mentor/assessments/${assessment.id}/results`}
          className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          <Download className="h-3.5 w-3.5" /> Download CSV
        </a>
        {attempts.length > 0 && <RegradeButton assessmentId={assessment.id} />}
      </div>

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

      {running.length > 0 && (
        <section className="glass-panel mt-5 p-4">
          <h2 className="font-display text-sm font-bold text-foreground">In progress ({running.length})</h2>
          <ul className="mt-2 divide-y divide-border/30">
            {running.map((a) => {
              const deadline = attemptDeadline(a, assessment);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {a.user.firstName} {a.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attempt #{a.attemptNumber} · started {formatDhakaDateTime(a.startedAt)}
                      {deadline ? ` · ends ${formatDhakaDateTime(deadline)}` : " · untimed"}
                    </p>
                  </div>
                  {tools(a)}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Mobile: cards, one per attempt — the desktop table's columns
          (integrity review data included) are too dense to scan via
          horizontal scroll on a phone. */}
      <div className="glass-panel mt-5 p-0 md:hidden">
        {attempts.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No submitted attempts yet.</p>
        ) : (
          <ul className="divide-y divide-border/30">
            {attempts.map((a) => {
              const result = resultOf(a);
              return (
                <li key={a.id} className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {a.user.firstName} {a.user.lastName}
                    </p>
                    <span className="shrink-0 font-mono text-sm text-muted-foreground">
                      {a.percentage !== null ? `${Math.round(a.percentage)}%` : "Pending"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={`font-semibold ${result.className}`}>{result.label}</span>
                    <span className="text-muted-foreground">{RISK_LEVEL_LABEL[a.riskLevel]}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Attempt #{a.attemptNumber} · {timeOf(a)}
                    {" · "}
                    {a.submittedAt ? formatDhakaDateTime(a.submittedAt) : "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Link
                      href={`/mentor/grading/exams/${a.id}`}
                      className="flex h-11 items-center text-xs font-semibold text-accent hover:underline"
                    >
                      Answers →
                    </Link>
                    <Link
                      href={`/mentor/grading/exams/${a.id}/integrity`}
                      className="flex h-11 items-center text-xs font-semibold text-accent hover:underline"
                    >
                      Integrity →
                    </Link>
                    {tools(a)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop: table, scoped to md and up. */}
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
            {attempts.map((a) => {
              const result = resultOf(a);
              return (
                <tr key={a.id} className="border-b border-border/30 align-top last:border-0">
                  <td className="px-3 py-2.5 text-foreground">{a.user.firstName} {a.user.lastName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {a.percentage !== null ? `${Math.round(a.percentage)}%` : "Pending"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold ${result.className}`}>{result.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{timeOf(a)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">#{a.attemptNumber}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {a.submittedAt ? formatDhakaDateTime(a.submittedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{RISK_LEVEL_LABEL[a.riskLevel]}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-3">
                        <Link
                          href={`/mentor/grading/exams/${a.id}`}
                          className="text-xs font-semibold text-accent hover:underline"
                        >
                          Answers →
                        </Link>
                        <Link
                          href={`/mentor/grading/exams/${a.id}/integrity`}
                          className="text-xs font-semibold text-accent hover:underline"
                        >
                          Integrity →
                        </Link>
                      </div>
                      {tools(a)}
                    </div>
                  </td>
                </tr>
              );
            })}
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
