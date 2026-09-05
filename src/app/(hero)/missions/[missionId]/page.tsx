import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlayCircle, Award, GraduationCap, ChevronRight, BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

/**
 * Mission overview — step 1 of the drill-down: Subjects (Modules).
 * Chapters, class types, and lessons all live one, two, and three taps
 * deeper respectively (see operations/[operationId] and beyond). This
 * page intentionally does NOT render the full curriculum tree anymore —
 * that flat "everything on one page" layout is what students found
 * overwhelming; each subject is now its own tap.
 */
export default async function MissionOverviewPage({
  params,
}: {
  params: { missionId: string };
}) {
  const user = await getCurrentUser();

  // Cheap existence + enrollment check first — avoids fetching the full
  // module/chapter/group/lesson tree below only to redirect it away.
  await assertCourseEnrollment(user.id, params.missionId);

  const [course, enrollment] = await Promise.all([
    db.course.findUnique({
      where: { id: params.missionId },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        examsEnabled: true,
        teacher: { select: { firstName: true, lastName: true } },
        modules: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            summary: true,
            chapters: {
              select: {
                id: true,
                groups: {
                  select: {
                    id: true,
                    // Only lesson ids are read on this page (counts +
                    // progress lookups) — title isn't shown here, so
                    // skip it and every other lesson column.
                    lessons: { select: { id: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
  ]);

  // Both were already confirmed to exist by assertCourseEnrollment above;
  // these guards are just for TypeScript narrowing (and the vanishingly
  // small race where either row was deleted between the two checks).
  if (!course) notFound();
  if (!enrollment) redirect(`/courses/${course.slug}`);

  const flat = course.modules.flatMap((m) =>
    m.chapters.flatMap((c) =>
      c.groups.flatMap((g) =>
        g.lessons.map((l) => ({
          lessonId: l.id,
          groupId: g.id,
          chapterId: c.id,
          moduleId: m.id,
        }))
      )
    )
  );
  const progressRows = await db.lessonProgress.findMany({
    where: { userId: user.id, lessonId: { in: flat.map((l) => l.lessonId) } },
    select: { lessonId: true, isCompleted: true },
  });
  const completedIds = new Set(
    progressRows.filter((p) => p.isCompleted).map((p) => p.lessonId)
  );

  const firstIncomplete = flat.find((l) => !completedIds.has(l.lessonId)) ?? flat[0];

  const subjectSummaries = course.modules.map((m) => {
    const lessonsInModule = m.chapters.flatMap((c) => c.groups.flatMap((g) => g.lessons));
    const completedInModule = lessonsInModule.filter((l) => completedIds.has(l.id)).length;
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      chapterCount: m.chapters.length,
      lessonCount: lessonsInModule.length,
      completedCount: completedInModule,
    };
  });

  const isComplete = enrollment.status === "COMPLETED";

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
        <DoodleStar className="pointer-events-none absolute -left-2 -top-2 h-10 w-10 -rotate-12 opacity-70" />
        <DoodleSparkle className="pointer-events-none absolute right-24 top-4 hidden h-8 w-8 opacity-70 sm:block" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Mentor: {course.teacher.firstName} {course.teacher.lastName}
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold text-foreground">
              {course.title}
            </h1>
          </div>
          <ProggyMascot state="encouraging" className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" />
        </div>

        <div className="relative mt-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">Mission progress</span>
            <span className="sticker bg-xp px-2.5 py-0.5 font-mono font-extrabold text-background">
              {enrollment.progressPct}%
            </span>
          </div>
          <AnimatedProgressBar percent={enrollment.progressPct} className="mt-1.5" />
        </div>

        {isComplete ? (
          <div className="relative mt-5 flex items-center gap-2 rounded-xl bg-xp/10 p-4 text-sm font-semibold text-xp">
            <Award className="h-5 w-5" />
            Mission complete — your medal is ready in the Medals tab.
          </div>
        ) : (
          firstIncomplete && (
            <Button asChild variant="accent" size="lg" className="comic-btn relative mt-5">
              <Link
                href={`/missions/${course.id}/operations/${firstIncomplete.moduleId}/chapters/${firstIncomplete.chapterId}/groups/${firstIncomplete.groupId}/patrols/${firstIncomplete.lessonId}`}
                prefetch={false}
              >
                <PlayCircle className="h-4 w-4" />
                {progressRows.length === 0 ? "Start mission" : "Continue mission"}
              </Link>
            </Button>
          )
        )}

        {course.examsEnabled && (
          <Link
            href={`/missions/${course.id}/exams`}
            className="relative mt-4 flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
          >
            <GraduationCap className="h-4 w-4" /> Exams →
          </Link>
        )}
      </StaggerItem>

      <StaggerItem>
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {course.description}
        </p>
      </StaggerItem>

      <StaggerItem as="section">
        <h2 className="font-display text-lg font-bold text-foreground">Subjects</h2>
        <div className="mt-3 space-y-2.5">
          {subjectSummaries.map((subject) => (
            <Link
              key={subject.id}
              href={`/missions/${course.id}/operations/${subject.id}`}
              className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-4"
            >
              <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-primary/15 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-foreground">
                  {subject.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subject.chapterCount} chapter{subject.chapterCount === 1 ? "" : "s"} ·{" "}
                  {subject.lessonCount} patrol{subject.lessonCount === 1 ? "" : "s"}
                  {subject.lessonCount > 0 &&
                    ` · ${subject.completedCount}/${subject.lessonCount} done`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}

          {subjectSummaries.length === 0 && (
            <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-8 text-center">
              <ProggyMascot state="thinking" className="h-14 w-14" />
              <p className="text-sm text-muted-foreground">
                No subjects added to this mission yet.
              </p>
            </div>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
