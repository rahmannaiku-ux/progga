import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { StartAttemptButton } from "@/components/course/start-attempt-button";
import { ExamRunner } from "@/components/course/exam-runner";
import { AttemptResults } from "@/components/course/attempt-results";
import { ExamAnalysis } from "@/components/course/exam-analysis";
import { CalendarClock, CheckCircle2, Clock3, ListChecks, RotateCcw, ShieldAlert, Target } from "lucide-react";
import { formatDhakaDateTime } from "@/lib/timezone";
import { examCourseTitle, getAvailability } from "@/lib/exam-display";
import { getAssessmentAnalytics } from "@/server/services/exam-analytics";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { buildAttemptBreakdown } from "@/server/services/attempt-breakdown";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";

export default async function EncounterPage({
  params,
}: {
  params: { examId: string };
}) {
  const user = await getCurrentUser();

  const assessment = await db.assessment.findUnique({
    where: { id: params.examId },
    include: {
      questionLinks: {
        orderBy: { order: "asc" },
        include: { question: { include: { options: true } } },
      },
      lesson: {
        select: {
          title: true,
          group: {
            select: {
              chapter: {
                select: { module: { select: { courseId: true, course: { select: { slug: true, title: true } } } } },
              },
            },
          },
        },
      },
      // Direct chapter placement (Exam Management PHASE 4/18) — a
      // second, independent path to a courseId/slug alongside the
      // lesson path above and the direct course path below. An exam
      // has at most one of these three set at a time in practice, but
      // all three are resolved the same way so this page doesn't care
      // which placement a given exam uses.
      chapter: {
        select: {
          title: true,
          module: { select: { courseId: true, course: { select: { slug: true, title: true } } } },
        },
      },
      course: { select: { id: true, title: true, slug: true } },
    },
  });
  if (!assessment) notFound();

  const courseId =
    assessment.courseId ?? assessment.chapter?.module.courseId ?? assessment.lesson?.group.chapter.module.courseId;
  if (!courseId) notFound();
  const courseSlug =
    assessment.course?.slug ?? assessment.chapter?.module.course.slug ?? assessment.lesson?.group.chapter.module.course.slug;

  // `attempts` only depends on assessment.id (already resolved above), not
  // on the enrollment check's result — so it can be fetched in the same
  // batch as the enrollment gate instead of waiting on it. If enrollment
  // turns out missing we redirect and simply don't use `attempts`; no
  // authorization semantics change, just one fewer sequential round trip
  // on every encounter view.
  const [enrollment, attempts] = await Promise.all([
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    }),
    db.assessmentAttempt.findMany({
      where: { assessmentId: assessment.id, userId: user.id },
      orderBy: { attemptNumber: "desc" },
    }),
  ]);
  if (!enrollment) redirect(courseSlug ? `/courses/${courseSlug}` : `/missions/${courseId}`);

  if (!assessment.publishedAt) {
    return (
      <div className="glass-panel mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
        This encounter isn't published yet — check back soon.
      </div>
    );
  }

  const latest = attempts[0];
  const attemptsUsed = attempts.length;
  const attemptsRemaining = Math.max(0, assessment.maxAttempts - attemptsUsed);

  const questionsById = new Map(assessment.questionLinks.map((l) => [l.questionId, l.question]));

  // ------------------------------------------------------------------
  // IN PROGRESS → exam runner
  // ------------------------------------------------------------------
  if (latest?.status === "IN_PROGRESS") {
    const orderedQuestions = latest.selectedQuestionIds
      .map((id) => questionsById.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const savedAnswers = await db.questionAnswer.findMany({
      where: { attemptId: latest.id },
      select: {
        questionId: true,
        selectedOptionIds: true,
        textAnswer: true,
        markedForReview: true,
        isLocked: true,
      },
    });

    return (
      <StaggerContainer className="mx-auto max-w-2xl">
        <StaggerItem>
          <h1 className="font-display text-xl font-semibold text-foreground">
            {assessment.title}
          </h1>
          <div className="mt-4">
            <ExamRunner
              attemptId={latest.id}
              studentName={`${user.firstName} ${user.lastName}`.trim() || user.email || "Student"}
              examTitle={assessment.title}
              questions={orderedQuestions.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                points: q.points,
                options: q.options.map((o) => ({ id: o.id, label: o.label })),
                numericUnit: q.numericUnit,
              }))}
              savedAnswers={savedAnswers}
              timeLimitSeconds={assessment.timeLimitSeconds}
              startedAt={latest.startedAt.toISOString()}
              autoSubmitOnExpiry={assessment.autoSubmitOnExpiry}
              fullscreenRequired={assessment.fullscreenRequired}
              tabSwitchDetection={assessment.tabSwitchDetection}
              lockAnswersAfterSelection={assessment.lockAnswersAfterSelection}
              detectCopyPaste={assessment.detectCopyPaste}
              detectScreenshotAttempts={assessment.detectScreenshotAttempts}
              detectSessionAnomalies={assessment.detectSessionAnomalies}
            />
          </div>
        </StaggerItem>
      </StaggerContainer>
    );
  }

  // ------------------------------------------------------------------
  // SUBMITTED / GRADED → results
  // ------------------------------------------------------------------
  if (latest && (latest.status === "SUBMITTED" || latest.status === "GRADED")) {
    const answers = await db.questionAnswer.findMany({
      where: { attemptId: latest.id },
      include: { question: { include: { options: true } } },
    });

    const breakdown = buildAttemptBreakdown(latest.selectedQuestionIds, answers, questionsById);

    // Peer comparison only makes sense once a score is truly final — a
    // SUBMITTED attempt awaiting manual (essay/short-answer) grading has no
    // stable percentage yet, so we skip analytics until it flips to GRADED.
    const analytics =
      latest.status === "GRADED"
        ? await getAssessmentAnalytics(assessment.id, user.id)
        : null;

    return (
      <StaggerContainer className="mx-auto max-w-3xl">
        <StaggerItem>
          <Link
            href={courseId ? `/missions/${courseId}` : "/dashboard"}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to mission
          </Link>
          <Link href="/results" className="ml-4 text-xs text-muted-foreground hover:text-foreground">
            All results
          </Link>
          <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
            {assessment.title}
          </h1>
        </StaggerItem>

        <StaggerItem className="mt-4">
          <AttemptResults
            status={latest.status}
            rawScore={latest.rawScore}
            maxScore={latest.maxScore}
            percentage={latest.percentage}
            isPassed={latest.isPassed}
            passPercentage={assessment.passPercentage}
            wasDisqualified={latest.wasDisqualified}
            showBreakdown={assessment.showResultsInstantly}
            breakdown={breakdown}
            attemptsRemaining={attemptsRemaining}
            timeTakenSeconds={
              latest.submittedAt
                ? Math.max(0, Math.round((latest.submittedAt.getTime() - latest.startedAt.getTime()) / 1000))
                : null
            }
          />
        </StaggerItem>

        {analytics && (
          <StaggerItem className="mt-6">
            <ExamAnalysis analytics={analytics} />
          </StaggerItem>
        )}

        {attemptsRemaining > 0 && !latest.isPassed && (
          <StaggerItem className="mt-6">
            <StartAttemptButton assessmentId={assessment.id} label="Retry encounter" />
          </StaggerItem>
        )}
      </StaggerContainer>
    );
  }

  // ------------------------------------------------------------------
  // NOT STARTED → start screen
  // ------------------------------------------------------------------
  const totalMarks = assessment.questionLinks.reduce((sum, l) => sum + l.question.points, 0);
  const xpReward = assessment.kind === "EXAM" ? XP_REWARDS.EXAM_PASSED : XP_REWARDS.QUIZ_PASSED;
  const securityFeatures: string[] = [];
  if (assessment.fullscreenRequired) securityFeatures.push("Fullscreen required");
  if (assessment.tabSwitchDetection) securityFeatures.push("Tab switching is monitored");
  if (assessment.lockAnswersAfterSelection) securityFeatures.push("Answers lock once selected");
  if (assessment.detectCopyPaste) securityFeatures.push("Copy/paste is monitored");
  if (assessment.detectScreenshotAttempts) securityFeatures.push("Screenshot attempts are monitored");
  if (assessment.detectSessionAnomalies) securityFeatures.push("Session activity is monitored");
  const securityEnabled = securityFeatures.length > 0;

  const availability = getAvailability(assessment);
  const courseTitle = examCourseTitle(assessment);
  const availabilityText =
    availability === "upcoming" && assessment.accessOpensAt
      ? `Opens ${formatDhakaDateTime(assessment.accessOpensAt)}`
      : availability === "closed" && assessment.accessClosesAt
        ? `Closed ${formatDhakaDateTime(assessment.accessClosesAt)}`
        : availability === "open"
          ? assessment.accessClosesAt
            ? `Open until ${formatDhakaDateTime(assessment.accessClosesAt)}`
            : "Open now"
          : "Open any time";

  const facts = [
    { icon: ListChecks, label: "Questions", value: String(assessment.questionLinks.length) },
    { icon: Target, label: "Total marks", value: String(totalMarks) },
    {
      icon: Clock3,
      label: "Duration",
      value: assessment.timeLimitSeconds ? `${Math.round(assessment.timeLimitSeconds / 60)} min` : "Untimed",
    },
    { icon: CheckCircle2, label: "Pass mark", value: `${assessment.passPercentage}%` },
    { icon: RotateCcw, label: "Attempts", value: `${attemptsUsed} / ${assessment.maxAttempts} used` },
    { icon: CalendarClock, label: "Availability", value: availabilityText },
  ];

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-4">
      <StaggerItem>
        <Link href="/exams" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          ← All exams
        </Link>
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5 sm:p-7">
        <p className="truncate text-xs font-semibold text-muted-foreground">
          {assessment.kind === "EXAM" ? "Exam" : "Quiz"}
          {courseTitle && ` · ${courseTitle}`}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground">{assessment.title}</h1>

        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
              <f.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                <dd className="text-sm font-bold text-foreground">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <li className="rounded-full bg-xp/25 px-3 py-1 text-foreground">+{xpReward} XP on passing</li>
          {assessment.coinReward > 0 && (
            <li className="rounded-full bg-xp/25 px-3 py-1 text-foreground">
              +{assessment.coinReward} Proggy Coins on passing
            </li>
          )}
          {assessment.negativeMarkingRatio > 0 && (
            <li className="rounded-full bg-danger/10 px-3 py-1 text-danger">
              Negative marking: -{assessment.negativeMarkingRatio * 100}% per wrong answer
            </li>
          )}
        </ul>
      </StaggerItem>

      {assessment.instructions && (
        <StaggerItem className="comic-panel bg-surface p-5">
          <h2 className="font-display text-base font-extrabold text-foreground">Instructions</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{assessment.instructions}</p>
        </StaggerItem>
      )}

      {securityEnabled && (
        <StaggerItem className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5 font-bold text-foreground">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Exam security is enabled
          </p>
          <p className="mt-1 text-xs">
            Leaving the exam page, attempting screen capture, or copying protected content may generate integrity
            events.
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {securityFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </StaggerItem>
      )}

      <StaggerItem className="comic-panel bg-surface p-5 text-foreground">
        {attemptsRemaining > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">
              {attemptsUsed === 0
                ? "Ready when you are. The timer starts as soon as you begin."
                : `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left.`}
            </p>
            <StartAttemptButton
              assessmentId={assessment.id}
              label={attemptsUsed === 0 ? "Start Exam" : "Start next attempt"}
            />
          </div>
        ) : (
          <p className="text-sm font-semibold">You have used all {assessment.maxAttempts} attempts for this exam.</p>
        )}
      </StaggerItem>
    </StaggerContainer>
  );
}
