import { GraduationCap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { examCourseTitle, getAvailability, getExamCardState, type ExamCardStateKey } from "@/lib/exam-display";
import { ExamCard, type ExamCardData } from "@/components/exam/exam-card";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const COURSE_TITLE = { select: { module: { select: { course: { select: { title: true } } } } } } as const;

/**
 * Every published quiz/exam across the missions the student is enrolled
 * in. Starting, taking and submitting all happen on /exams/[examId]; this
 * page only lists them and links there.
 */
export default async function ExamsPage() {
  const user = await getCurrentUser();

  const enrollments = await db.enrollment.findMany({
    where: { userId: user.id },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);

  const assessments = await db.assessment.findMany({
    where: {
      publishedAt: { not: null },
      OR: [
        { courseId: { in: courseIds } },
        { chapter: { module: { courseId: { in: courseIds } } } },
        { lesson: { group: { chapter: { module: { courseId: { in: courseIds } } } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      course: { select: { title: true } },
      chapter: COURSE_TITLE,
      lesson: { select: { group: { select: { chapter: COURSE_TITLE } } } },
      questionLinks: { select: { question: { select: { points: true } } } },
      attempts: {
        where: { userId: user.id },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, percentage: true, isPassed: true },
      },
    },
  });

  const now = new Date();
  const cards = assessments.map((a) => {
    const availability = getAvailability(a, now);
    const state = getExamCardState({ attempts: a.attempts, maxAttempts: a.maxAttempts, availability });
    const bestGraded = a.attempts
      .filter((att) => att.status === "GRADED" && att.percentage != null)
      .sort((x, y) => (y.percentage ?? 0) - (x.percentage ?? 0))[0];

    let availabilityText = "Open any time";
    if (availability === "upcoming" && a.accessOpensAt) availabilityText = `Opens ${formatDhakaDateTime(a.accessOpensAt)}`;
    else if (availability === "closed" && a.accessClosesAt) availabilityText = `Closed ${formatDhakaDateTime(a.accessClosesAt)}`;
    else if (availability === "open") {
      availabilityText = a.accessClosesAt ? `Open until ${formatDhakaDateTime(a.accessClosesAt)}` : "Open now";
    }

    const data: ExamCardData = {
      id: a.id,
      title: a.title,
      kind: a.kind,
      courseTitle: examCourseTitle(a),
      questionCount: a.questionLinks.length,
      totalMarks: a.questionLinks.reduce((sum, l) => sum + l.question.points, 0),
      timeLimitSeconds: a.timeLimitSeconds,
      attemptsUsed: a.attempts.length,
      maxAttempts: a.maxAttempts,
      availabilityText,
      bestPercentage: bestGraded?.percentage ?? null,
      bestPassed: bestGraded?.isPassed ?? null,
      state,
    };
    return data;
  });

  const groupOf = (key: ExamCardStateKey) =>
    key === "in-progress"
      ? "progress"
      : key === "not-started" || key === "retry"
        ? "available"
        : key === "upcoming"
          ? "upcoming"
          : "completed";
  const groups = [
    { id: "progress", title: "In progress", hint: "Pick up where you left off." },
    { id: "available", title: "Available", hint: "Ready to start." },
    { id: "upcoming", title: "Upcoming", hint: "Not open yet." },
    { id: "completed", title: "Completed", hint: "Finished, closed or waiting for review." },
  ].map((g) => ({ ...g, cards: cards.filter((c) => groupOf(c.state.key) === g.id) }));

  const scored = cards.filter((c) => c.bestPercentage != null);
  const average = scored.length ? Math.round(scored.reduce((s, c) => s + (c.bestPercentage ?? 0), 0) / scored.length) : null;
  const summary = [
    { label: "Available", value: groups[1]!.cards.length + groups[0]!.cards.length },
    { label: "Upcoming", value: groups[2]!.cards.length },
    { label: "Completed", value: groups[3]!.cards.length },
    { label: "Avg. best score", value: average == null ? "–" : `${average}%` },
  ];

  return (
    <StaggerContainer className="mx-auto max-w-3xl space-y-6">
      <StaggerItem className="comic-panel-bold overflow-hidden bg-primary p-5 text-primary-foreground sm:p-6">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground/70">
              <GraduationCap className="h-4 w-4" aria-hidden="true" /> Exam Center
            </p>
            <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Your Exams</h1>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Quizzes and exams from your missions, all in one place.
            </p>
          </div>
          <ProggyMascot state="studying" className="hidden h-20 w-20 shrink-0 sm:block" />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-xl bg-primary-foreground/10 px-3 py-2.5">
              <dd className="font-mono text-xl font-extrabold leading-none">{s.value}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-wide text-primary-foreground/70">{s.label}</dt>
            </div>
          ))}
        </dl>
      </StaggerItem>

      {cards.length === 0 && (
        <StaggerItem className="comic-panel flex items-center gap-4 bg-surface p-5">
          <ProggyMascot state="thinking" className="h-16 w-16 shrink-0" />
          <div>
            <p className="font-display text-base font-extrabold text-foreground">No exams available yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When a mentor publishes a quiz or exam in one of your missions, it will appear here.
            </p>
          </div>
        </StaggerItem>
      )}

      {groups
        .filter((g) => g.cards.length > 0)
        .map((g) => (
          <StaggerItem as="section" key={g.id} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-extrabold text-foreground">
                {g.title} <span className="font-mono text-sm text-muted-foreground">({g.cards.length})</span>
              </h2>
              <p className="hidden text-xs text-muted-foreground sm:block">{g.hint}</p>
            </div>
            <div className="space-y-3">
              {g.cards.map((c) => (
                <ExamCard key={c.id} exam={c} />
              ))}
            </div>
          </StaggerItem>
        ))}
    </StaggerContainer>
  );
}
