import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GraduationCap, Clock3, ListChecks, RotateCcw } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

/**
 * Course-scoped exam list — "My Courses → Course → Exams" from the
 * spec. Deliberately NOT a global sidebar item; this route only exists
 * under one course and 404s outright if that course doesn't have exams
 * turned on, rather than showing an empty/misleading list.
 *
 * Shows every published assessment associated with this course, both
 * course-level (Assessment.courseId set directly) and lesson-attached
 * (Assessment.lessonId, resolved through lesson → group → chapter → module) —
 * the reference course/exam tree groups both under one "Exams" tab.
 */
export default async function CourseExamsPage({ params }: { params: { missionId: string } }) {
  const user = await getCurrentUser();

  const [course, enrollment] = await Promise.all([
    db.course.findUnique({
      where: { id: params.missionId },
      select: { id: true, title: true, examsEnabled: true, slug: true },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
  ]);

  if (!course) notFound();
  if (!enrollment) redirect(`/courses/${course.slug}`);
  if (!course.examsEnabled) notFound();

  const assessments = await db.assessment.findMany({
    where: {
      publishedAt: { not: null },
      OR: [
        { courseId: course.id },
        { lesson: { group: { chapter: { module: { courseId: course.id } } } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      lesson: { select: { title: true } },
      _count: { select: { questionLinks: true } },
      attempts: {
        where: { userId: user.id },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, percentage: true, isPassed: true },
      },
    },
  });

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            {course.title} — Exams
          </h1>
          <p className="text-sm text-muted-foreground">Quizzes and exams for this mission.</p>
        </div>
      </StaggerItem>

      {assessments.length === 0 && (
        <StaggerItem className="comic-panel flex flex-col items-center gap-3 bg-surface p-10 text-center">
          <ProggyMascot state="thinking" className="h-16 w-16" />
          <p className="text-sm text-muted-foreground">No exams published for this mission yet.</p>
        </StaggerItem>
      )}

      {assessments.map((a) => {
        const bestAttempt = a.attempts.find((att) => att.status === "GRADED") ?? a.attempts[0];
        const inProgress = a.attempts.find((att) => att.status === "IN_PROGRESS");
        // Matches startAttempt's own check exactly (counts every attempt,
        // including the in-progress one) — this is a display of that
        // same rule, not a second source of truth for it.
        const attemptsUsed = a.attempts.length;
        const canStartNew = attemptsUsed < a.maxAttempts;

        return (
          <StaggerItem key={a.id} className="comic-panel bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {a.kind === "EXAM" ? "Exam" : "Quiz"}
                  {a.lesson && ` · ${a.lesson.title}`}
                </p>
                <p className="mt-0.5 font-display text-base font-bold text-foreground">{a.title}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" /> {a._count.questionLinks} questions
                  </span>
                  {a.timeLimitSeconds && (
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {Math.round(a.timeLimitSeconds / 60)} min
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> {attemptsUsed}/{a.maxAttempts} attempts
                  </span>
                </div>
              </div>

              {bestAttempt?.percentage != null && (
                <span
                  className={
                    "sticker shrink-0 px-3 py-1 font-mono text-sm font-bold " +
                    (bestAttempt.isPassed ? "bg-xp text-xp-foreground" : "bg-danger/10 text-danger")
                  }
                >
                  {Math.round(bestAttempt.percentage)}%
                </span>
              )}
            </div>

            <div className="mt-4">
              {inProgress ? (
                <Link
                  href={`/encounters/${a.id}`}
                  className="comic-btn inline-flex items-center gap-1.5 bg-xp px-4 py-2 text-xs font-bold text-xp-foreground"
                >
                  Continue attempt
                </Link>
              ) : canStartNew ? (
                <Link
                  href={`/encounters/${a.id}`}
                  className="comic-btn inline-flex items-center gap-1.5 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                >
                  {attemptsUsed > 0 ? "Retake" : "Start"}
                </Link>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  No attempts remaining
                </span>
              )}
            </div>
          </StaggerItem>
        );
      })}
    </StaggerContainer>
  );
}
