import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { AttemptResults } from "@/components/course/attempt-results";
import { ExamAnalysis } from "@/components/course/exam-analysis";
import { getAssessmentAnalytics } from "@/server/services/exam-analytics";
import { buildAttemptBreakdown } from "@/server/services/attempt-breakdown";
import { formatDhakaDateTime } from "@/lib/timezone";
import { examCourseTitle } from "@/lib/exam-display";
import { ExamStatusBadge } from "@/components/exam/exam-card";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const COURSE_TITLE = { select: { module: { select: { course: { select: { title: true } } } } } } as const;

/** One attempt's result. `resultId` is the attempt id; only its owner can open it. */
export default async function ResultPage({ params }: { params: { resultId: string } }) {
  const user = await getCurrentUser();

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: params.resultId },
    include: {
      assessment: {
        include: {
          course: { select: { title: true } },
          chapter: COURSE_TITLE,
          lesson: { select: { group: { select: { chapter: COURSE_TITLE } } } },
          questionLinks: { include: { question: { include: { options: true } } } },
        },
      },
    },
  });
  // Someone else's attempt looks the same as one that doesn't exist.
  if (!attempt || attempt.userId !== user.id) notFound();
  const { assessment } = attempt;
  if (attempt.status === "IN_PROGRESS") redirect(`/exams/${assessment.id}`);

  const [answers, attemptsUsed] = await Promise.all([
    db.questionAnswer.findMany({ where: { attemptId: attempt.id } }),
    db.assessmentAttempt.count({ where: { assessmentId: assessment.id, userId: user.id } }),
  ]);
  const questionsById = new Map(assessment.questionLinks.map((l) => [l.questionId, l.question]));
  const breakdown = buildAttemptBreakdown(attempt.selectedQuestionIds, answers, questionsById);
  const courseTitle = examCourseTitle(assessment);
  const timeTakenSeconds = attempt.submittedAt
    ? Math.max(0, Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000))
    : null;
  const analytics = attempt.status === "GRADED" ? await getAssessmentAnalytics(assessment.id, user.id) : null;

  return (
    <StaggerContainer className="mx-auto max-w-3xl">
      <StaggerItem>
        <Link href="/results" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          ← All results
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {assessment.kind === "EXAM" ? "Exam" : "Quiz"}
              {courseTitle && ` · ${courseTitle}`}
            </p>
            <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground">{assessment.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Attempt {attempt.attemptNumber} · {formatDhakaDateTime(attempt.submittedAt ?? attempt.startedAt)}
            </p>
          </div>
          <ExamStatusBadge
            stateKey={attempt.status === "SUBMITTED" ? "awaiting-review" : attempt.isPassed ? "passed" : "retry"}
            label={attempt.status === "SUBMITTED" ? "Awaiting review" : attempt.isPassed ? "Passed" : "Not passed"}
          />
        </div>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <AttemptResults
          status={attempt.status}
          rawScore={attempt.rawScore}
          maxScore={attempt.maxScore}
          percentage={attempt.percentage}
          isPassed={attempt.isPassed}
          passPercentage={assessment.passPercentage}
          wasDisqualified={attempt.wasDisqualified}
          showBreakdown={assessment.showResultsInstantly}
          breakdown={breakdown}
          attemptsRemaining={Math.max(0, assessment.maxAttempts - attemptsUsed)}
          timeTakenSeconds={timeTakenSeconds}
        />
      </StaggerItem>

      {analytics && (
        <StaggerItem className="mt-6">
          <ExamAnalysis analytics={analytics} />
        </StaggerItem>
      )}

      <StaggerItem className="mt-6">
        <Link href={`/exams/${assessment.id}`} className="text-sm font-bold text-primary hover:underline">
          Back to this exam
        </Link>
      </StaggerItem>
    </StaggerContainer>
  );
}
