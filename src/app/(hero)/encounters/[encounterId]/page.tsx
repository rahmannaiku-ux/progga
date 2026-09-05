import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { StartAttemptButton } from "@/components/course/start-attempt-button";
import { ExamRunner } from "@/components/course/exam-runner";
import { AttemptResults } from "@/components/course/attempt-results";
import { ExamAnalysis } from "@/components/course/exam-analysis";
import { Badge } from "@/components/ui/badge";
import { getAssessmentAnalytics } from "@/server/services/exam-analytics";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";

export default async function EncounterPage({
  params,
}: {
  params: { encounterId: string };
}) {
  const user = await getCurrentUser();

  const assessment = await db.assessment.findUnique({
    where: { id: params.encounterId },
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
                select: { module: { select: { courseId: true, course: { select: { slug: true } } } } },
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
          module: { select: { courseId: true, course: { select: { slug: true } } } },
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
              studentName={`${user.firstName} ${user.lastName}`.trim() || user.email}
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

    const breakdown = latest.selectedQuestionIds
      .map((qid) => {
        const answer = answers.find((a) => a.questionId === qid);
        const question = questionsById.get(qid);
        if (!answer || !question) return null;
        const selectedLabels = question.options
          .filter((o) => answer.selectedOptionIds.includes(o.id))
          .map((o) => o.label);
        return {
          questionId: qid,
          prompt: question.prompt,
          type: question.type,
          points: question.points,
          pointsAwarded: answer.pointsAwarded,
          isCorrect: answer.isCorrect,
          explanation: question.explanation,
          yourAnswerLabels:
            selectedLabels.length > 0
              ? selectedLabels
              : answer.textAnswer
                ? [answer.textAnswer]
                : [],
          correctAnswerLabels:
            question.type === "NUMERICAL"
              ? question.numericAnswer != null
                ? [
                    `${question.numericAnswer}${question.numericTolerance ? ` ± ${question.numericTolerance}` : ""}${question.numericUnit ? ` ${question.numericUnit}` : ""}`,
                  ]
                : []
              : question.options.filter((o) => o.isCorrect).map((o) => o.label),
        };
      })
      .filter((b): b is NonNullable<typeof b> => Boolean(b));

    // Peer comparison only makes sense once a score is truly final — a
    // SUBMITTED attempt awaiting manual (essay/short-answer) grading has no
    // stable percentage yet, so we skip analytics until it flips to GRADED.
    const analytics =
      latest.status === "GRADED"
        ? await getAssessmentAnalytics(assessment.id, user.id)
        : null;

    return (
      <StaggerContainer className="mx-auto max-w-2xl">
        <StaggerItem>
          <Link
            href={courseId ? `/missions/${courseId}` : "/dashboard"}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to mission
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

  return (
    <StaggerContainer className="mx-auto max-w-2xl">
      <StaggerItem className="glass-panel p-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-foreground">
            {assessment.title}
          </h1>
          <Badge variant="outline">{assessment.kind}</Badge>
        </div>

        {assessment.instructions && (
          <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
            {assessment.instructions}
          </p>
        )}

        <ul className="mt-5 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <li>{assessment.questionLinks.length} questions</li>
          <li>
            {assessment.timeLimitSeconds
              ? `${Math.round(assessment.timeLimitSeconds / 60)} min limit`
              : "Untimed"}
          </li>
          <li>{totalMarks} total marks</li>
          <li>Pass mark: {assessment.passPercentage}%</li>
          <li>
            {attemptsUsed} / {assessment.maxAttempts} attempts used
          </li>
          {assessment.negativeMarkingRatio > 0 && (
            <li>Negative marking: -{assessment.negativeMarkingRatio * 100}% per wrong answer</li>
          )}
          <li>+{xpReward} XP on passing</li>
          {assessment.coinReward > 0 && <li>+{assessment.coinReward} Proggy Coins on passing</li>}
        </ul>

        {securityEnabled && (
          <div className="mt-5 rounded-xl border border-warning/30 bg-warning/5 p-3.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Exam security is enabled.</p>
            <p className="mt-1">
              Leaving the exam page, attempting screen capture, or copying protected content may
              generate integrity events.
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {securityFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          {attemptsRemaining > 0 ? (
            <StartAttemptButton
              assessmentId={assessment.id}
              label={attemptsUsed === 0 ? "Start encounter" : "Start next attempt"}
            />
          ) : (
            <p className="text-sm text-danger">
              You've used all {assessment.maxAttempts} attempts for this encounter.
            </p>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
