import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { AssignmentGradingForm } from "@/components/mentor-dashboard/assignment-grading-form";

type Rubric = { criterion: string; points: number }[];

export default async function GradeSubmissionPage({
  params,
}: {
  params: { submissionId: string };
}) {
  const user = await requireRole("TEACHER");

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: params.submissionId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      assignment: {
        include: {
          lesson: {
            select: {
              group: { select: { chapter: { select: { module: { select: { course: { select: { teacherId: true } } } } } } } },
            },
          },
        },
      },
    },
  });
  if (!submission) notFound();

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const ownerId = submission.assignment.lesson?.group.chapter.module.course?.teacherId;
  if (!isAdmin && ownerId !== user.id) notFound();

  const rubric = (submission.assignment.rubric as Rubric | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-xl font-semibold text-foreground">
        {submission.assignment.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {submission.user.firstName} {submission.user.lastName}
      </p>

      <div className="glass-panel mt-4 p-5">
        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {submission.comment || "No comment left by the student."}
        </p>
        <ul className="mt-3 space-y-1.5">
          {submission.fileUrls.map((url, i) => (
            <li key={i}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80"
              >
                <FileText className="h-3.5 w-3.5" /> Submitted file {i + 1}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {submission.status === "GRADED" ? (
        <div className="glass-panel mt-6 p-5">
          <p className="text-sm font-semibold text-foreground">
            Graded: {submission.grade} / {submission.assignment.maxPoints}
          </p>
          {submission.feedback && (
            <p className="mt-2 text-sm text-muted-foreground">{submission.feedback}</p>
          )}
        </div>
      ) : (
        <AssignmentGradingForm
          submissionId={submission.id}
          maxPoints={submission.assignment.maxPoints}
          rubric={rubric}
        />
      )}
    </div>
  );
}
