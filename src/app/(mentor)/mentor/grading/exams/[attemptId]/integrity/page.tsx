import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import {
  getAttemptTimeline,
  getQuestionHistory,
  getAttemptIntegritySummary,
} from "@/server/services/exam-analytics";

/**
 * PHASE 16 — detailed review page for one attempt. Reuses the same
 * course/teacher ownership check as the grading page next to it
 * (grading/exams/[attemptId]/page.tsx) rather than inventing a new
 * access rule, and links back to it since grading and integrity review
 * are two views onto the same attempt, not two separate features.
 */
export default async function InvestigateAttemptPage({
  params,
}: {
  params: { attemptId: string };
}) {
  const user = await requireRole("TEACHER");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: params.attemptId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      assessment: { select: { title: true, course: { select: { teacherId: true } } } },
    },
  });
  if (!attempt) notFound();

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin && attempt.assessment.course?.teacherId !== user.id) notFound();

  const [summary, timeline, questionHistory, eventCounts] = await Promise.all([
    getAttemptIntegritySummary(attempt.id),
    getAttemptTimeline(attempt.id),
    getQuestionHistory(attempt.id),
    db.examIntegrityEvent.groupBy({
      by: ["type"],
      where: { attemptId: attempt.id, type: { in: ["COPY", "PASTE", "WINDOW_BLUR"] } },
      _count: true,
    }),
  ]);
  if (!summary) notFound();

  const countByType = Object.fromEntries(eventCounts.map((e) => [e.type, e._count])) as Record<string, number>;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/mentor/grading/exams/${attempt.id}`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to grading
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{attempt.assessment.title}</h1>
          <p className="text-xs text-muted-foreground">
            {attempt.user.firstName} {attempt.user.lastName} · Attempt #{attempt.attemptNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold text-foreground">
            {attempt.percentage !== null ? `${Math.round(attempt.percentage)}%` : "—"}
          </p>
          <p className="text-xs font-semibold">{summary.riskLabel}</p>
        </div>
      </div>

      {summary.riskReasons.length > 0 && (
        <div className="glass-panel mt-4 p-4">
          <p className="text-xs font-semibold text-foreground">Why this attempt was flagged</p>
          <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">
            {summary.riskReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] italic text-muted-foreground">
            No single signal here proves cheating — this is a review prompt, not a verdict.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tab switches" value={summary.tabSwitchCount} />
        <Stat label="Fullscreen exits" value={summary.fullscreenExitCount} />
        <Stat label="Focus losses" value={countByType.WINDOW_BLUR ?? 0} />
        <Stat label="Copy events" value={countByType.COPY ?? 0} />
        <Stat label="Paste events" value={countByType.PASTE ?? 0} />
        <Stat label="Screenshot attempts" value={summary.screenshotAttemptCount} />
        <Stat label="Session anomalies" value={summary.sessionAnomalyCount} />
        <Stat label="Lock violations" value={summary.lockViolationCount} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Timeline</h2>
        {timeline.truncated && (
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Showing the most recent {timeline.entries.length} events — this attempt generated more than that.
          </p>
        )}
        <div className="glass-panel divide-y divide-border/40 p-0">
          {timeline.entries.length === 0 && (
            <p className="p-4 text-xs text-muted-foreground">No integrity events recorded.</p>
          )}
          {timeline.entries.map((t, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="w-16 shrink-0 font-mono text-muted-foreground">
                {new Intl.DateTimeFormat("en-US", { timeStyle: "medium" }).format(t.at)}
              </span>
              <span className={t.kind === "answer" ? "text-foreground" : "text-muted-foreground"}>
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Question timing &amp; answer history</h2>
        <div className="space-y-3">
          {questionHistory.map((q, i) => (
            <div key={q.questionId} className="glass-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-foreground">
                  Q{i + 1}. {q.prompt}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {q.timeSpentSec >= 60
                    ? `${Math.floor(q.timeSpentSec / 60)}m ${q.timeSpentSec % 60}s`
                    : `${q.timeSpentSec}s`}
                  {q.markedForReview && " · ★ marked"}
                  {q.isLocked && " · 🔒 locked"}
                  {q.lockViolations > 0 && ` · ${q.lockViolations} rejected change${q.lockViolations === 1 ? "" : "s"}`}
                </span>
              </div>
              {q.changeHistory.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {q.changeHistory.map((h, hi) => (
                    <li key={hi} className="font-mono">
                      {new Intl.DateTimeFormat("en-US", { timeStyle: "medium" }).format(new Date(h.at))} →{" "}
                      {h.textAnswer || h.selectedOptionIds.join(", ") || "(cleared)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-2 text-center">
      <p className="font-display text-base font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
