import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { examCourseTitle } from "@/lib/exam-display";
import { ResultCard } from "@/components/exam/result-card";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const COURSE_TITLE = { select: { module: { select: { course: { select: { title: true } } } } } } as const;

/** The signed-in student's own submitted and graded attempts, newest first. */
export default async function ResultsPage() {
  const user = await getCurrentUser();

  const attempts = await db.assessmentAttempt.findMany({
    where: { userId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
    orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      attemptNumber: true,
      rawScore: true,
      maxScore: true,
      percentage: true,
      isPassed: true,
      submittedAt: true,
      startedAt: true,
      assessment: {
        select: {
          title: true,
          kind: true,
          course: { select: { title: true } },
          chapter: COURSE_TITLE,
          lesson: { select: { group: { select: { chapter: COURSE_TITLE } } } },
        },
      },
    },
  });

  const graded = attempts.filter((a) => a.status === "GRADED" && a.percentage != null);
  const passed = graded.filter((a) => a.isPassed).length;
  const best = graded.reduce((m, a) => Math.max(m, a.percentage ?? 0), 0);
  const average = graded.length ? Math.round(graded.reduce((s, a) => s + (a.percentage ?? 0), 0) / graded.length) : null;
  const summary = [
    { label: "Results", value: attempts.length },
    { label: "Passed", value: passed },
    { label: "Best score", value: graded.length ? `${Math.round(best)}%` : "–" },
    { label: "Average", value: average == null ? "–" : `${average}%` },
  ];

  return (
    <StaggerContainer className="mx-auto max-w-3xl space-y-6">
      <StaggerItem className="comic-panel-bold bg-primary p-5 text-primary-foreground sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground/70">
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> Result Center
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Your Results</h1>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Every quiz and exam you have finished, with scores and answer review.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-xl bg-primary-foreground/10 px-3 py-2.5">
              <dd className="font-mono text-xl font-extrabold leading-none">{s.value}</dd>
              <dt className="mt-1 text-[11px] text-primary-foreground/70">{s.label}</dt>
            </div>
          ))}
        </dl>
      </StaggerItem>

      {attempts.length === 0 ? (
        <StaggerItem className="comic-panel flex items-center gap-4 bg-surface p-5">
          <ProggyMascot state="thinking" className="h-16 w-16 shrink-0" />
          <div>
            <p className="font-display text-base font-extrabold text-foreground">No results yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once you finish an exam, your result will appear here, and graded results show up after mentor review.{" "}
              <Link href="/exams" className="font-bold text-primary hover:underline">
                Go to your exams
              </Link>
            </p>
          </div>
        </StaggerItem>
      ) : (
        <StaggerItem as="section" className="space-y-3">
          {attempts.map((a) => (
            <ResultCard
              key={a.id}
              result={{
                id: a.id,
                title: a.assessment.title,
                kind: a.assessment.kind,
                courseTitle: examCourseTitle(a.assessment),
                attemptNumber: a.attemptNumber,
                status: a.status,
                rawScore: a.rawScore,
                maxScore: a.maxScore,
                percentage: a.percentage,
                isPassed: a.isPassed,
                dateText: formatDhakaDateTime(a.submittedAt ?? a.startedAt),
              }}
            />
          ))}
        </StaggerItem>
      )}
    </StaggerContainer>
  );
}
