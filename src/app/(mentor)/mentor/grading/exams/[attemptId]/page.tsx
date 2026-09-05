import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { GradeAnswerForm } from "@/components/mentor-dashboard/grade-answer-form";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function GradeAttemptPage({
  params,
}: {
  params: { attemptId: string };
}) {
  const user = await requireRole("TEACHER");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: params.attemptId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      assessment: {
        select: {
          title: true,
          passPercentage: true,
          course: { select: { teacherId: true } },
        },
      },
      answers: {
        include: { question: { include: { options: true } } },
      },
    },
  });
  if (!attempt) notFound();

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin && attempt.assessment.course?.teacherId !== user.id) notFound();

  const ordered = attempt.selectedQuestionIds
    .map((qid) => attempt.answers.find((a) => a.questionId === qid))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {attempt.assessment.title}
        </h1>
        <Link
          href={`/mentor/grading/exams/${attempt.id}/integrity`}
          className="shrink-0 text-xs font-semibold text-accent hover:underline"
        >
          Integrity report →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {attempt.user.firstName} {attempt.user.lastName} · Attempt #{attempt.attemptNumber}
      </p>

      <div className="mt-6 space-y-4">
        {ordered.map((answer, i) => {
          const q = answer.question;
          const isWritten = q.type === "ESSAY" || q.type === "SHORT_ANSWER";
          const selectedLabels = q.options
            .filter((o) => answer.selectedOptionIds.includes(o.id))
            .map((o) => o.label);

          return (
            <div key={answer.id} className="glass-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  Q{i + 1}. {q.prompt}
                </p>
                {!isWritten &&
                  (answer.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-danger" />
                  ))}
              </div>

              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {selectedLabels.join(", ") || answer.textAnswer || "No answer submitted"}
              </p>

              {isWritten ? (
                <GradeAnswerForm
                  answerId={answer.id}
                  maxPoints={q.points}
                  initialPoints={answer.pointsAwarded}
                  initialFeedback={answer.teacherFeedback}
                  graded={Boolean(answer.gradedAt)}
                />
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {answer.pointsAwarded ?? 0} / {q.points} pts (auto-graded)
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
