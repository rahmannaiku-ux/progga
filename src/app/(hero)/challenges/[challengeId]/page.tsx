import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, CheckCircle2, Clock3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { AssignmentSubmissionForm } from "@/components/course/assignment-submission-form";

type Rubric = { criterion: string; points: number }[];

export default async function ChallengePage({
  params,
}: {
  params: { challengeId: string };
}) {
  const user = await getCurrentUser();

  const assignment = await db.assignment.findUnique({
    where: { id: params.challengeId },
    include: {
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
    },
  });
  if (!assignment || !assignment.lesson) notFound();

  const courseId = assignment.lesson.group.chapter.module.courseId;
  const courseSlug = assignment.lesson.group.chapter.module.course.slug;
  // `submission` only depends on assignment.id (already known) and the
  // current user — not on the enrollment check's result — so it can be
  // fetched in the same batch as the enrollment gate instead of after it.
  const [enrollment, submission] = await Promise.all([
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    }),
    db.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId: assignment.id, userId: user.id } },
    }),
  ]);
  if (!enrollment) redirect(`/courses/${courseSlug}`);

  const rubric = (assignment.rubric as Rubric | null) ?? [];
  const isPastDue = Boolean(assignment.dueAt && new Date() > assignment.dueAt);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/missions/${courseId}`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to mission
      </Link>

      <div className="comic-panel mt-2 p-6">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          {assignment.title}
        </h1>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Patrol: {assignment.lesson.title}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="sticker-badge bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
            {assignment.maxPoints} points
          </span>
          {assignment.dueAt && (
            <span
              className={`sticker-badge px-3 py-1 text-xs font-bold ${
                isPastDue ? "bg-danger/15 text-danger" : "bg-muted text-foreground"
              }`}
            >
              Due {assignment.dueAt.toLocaleDateString()}
            </span>
          )}
          {assignment.allowLateSubmission && (
            <span className="sticker-badge bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
              Late submissions allowed
            </span>
          )}
        </div>

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {assignment.instructions}
        </p>

        {rubric.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rubric
            </p>
            <ul className="mt-2 space-y-1">
              {rubric.map((r, i) => (
                <li key={i} className="flex justify-between text-sm text-foreground">
                  <span>{r.criterion}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.points} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6">
        {submission?.status === "GRADED" ? (
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <h2 className="font-display text-base font-semibold text-foreground">
                Graded: {submission.grade} / {assignment.maxPoints}
              </h2>
            </div>
            {submission.feedback && (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {submission.feedback}
              </p>
            )}
            {Array.isArray(submission.rubricScores) && submission.rubricScores.length > 0 && (
              <ul className="mt-3 space-y-1">
                {(submission.rubricScores as { criterion: string; pointsAwarded: number }[]).map(
                  (r, i) => (
                    <li key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span>{r.criterion}</span>
                      <span>{r.pointsAwarded} pts</span>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        ) : submission ? (
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-accent" />
              <h2 className="font-display text-base font-semibold text-foreground">
                Submitted — awaiting grade
              </h2>
            </div>
            <ul className="mt-3 space-y-1">
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
            {submission.status === "LATE" && (
              <Badge variant="outline" className="mt-2">
                Submitted late
              </Badge>
            )}
          </div>
        ) : isPastDue && !assignment.allowLateSubmission ? (
          <div className="glass-panel p-6 text-center text-sm text-danger">
            The deadline has passed and late submissions aren't allowed.
          </div>
        ) : (
          <AssignmentSubmissionForm assignmentId={assignment.id} />
        )}
      </div>
    </div>
  );
}
