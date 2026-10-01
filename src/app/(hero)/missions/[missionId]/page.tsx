import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlayCircle, Award, GraduationCap, ChevronRight, BookOpen, CalendarDays, Maximize2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { missionProgressPct } from "@/lib/progress-math";
import { mediaSrc, mediaViewUrl } from "@/lib/media-url";

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
        routineImageUrl: true,
        examsEnabled: true,
        teacher: { select: { firstName: true, lastName: true } },
        modules: {
          where: { isLiveContainer: false },
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
                    lessons: { where: { isPublished: true }, select: { id: true } },
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

  // Worked out from the same published lessons the subject counts use, so the
  // bar can never disagree with "x of y Patrols" (the stored percentage goes
  // stale when a mentor adds or publishes lessons after the student started).
  const progressPct = missionProgressPct(completedIds.size, flat.length);
  const isComplete = enrollment.status === "COMPLETED";
  const routineSrc = mediaSrc(course.routineImageUrl, 1600);
  const routineLink = mediaViewUrl(course.routineImageUrl);
  const totalPatrols = flat.length;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      {routineSrc && routineLink && (
        <StaggerItem>
          <a
            href={routineLink}
            target="_blank"
            rel="noopener noreferrer"
            className="comic-panel group relative block overflow-hidden bg-surface"
            aria-label="Open the class routine at full size"
          >
            {/* Plain img: Drive images come from changing Google hosts, which next/image cannot allow-list. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={routineSrc}
              alt={`${course.title} class routine`}
              referrerPolicy="no-referrer"
              className="block h-auto w-full"
            />
            <span className="sticker absolute left-3 top-3 flex items-center gap-1.5 bg-surface/90 px-2.5 py-1 text-xs font-bold text-foreground backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5 text-primary" /> Class routine
            </span>
            <span className="sticker absolute bottom-3 right-3 flex items-center gap-1.5 bg-surface/90 px-2.5 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
              <Maximize2 className="h-3 w-3" /> Tap to zoom
            </span>
          </a>
        </StaggerItem>
      )}

      <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
        <DoodleStar className="pointer-events-none absolute -left-2 -top-2 hidden h-10 w-10 -rotate-12 opacity-70 sm:block" />
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
          {!routineSrc && (
            <ProggyMascot state="encouraging" className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" />
          )}
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Subjects", value: subjectSummaries.length },
            { label: "Patrols", value: totalPatrols },
            { label: "Done", value: completedIds.size },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/30 bg-background/40 px-2 py-2">
              <p className="font-mono text-lg font-extrabold text-foreground">{stat.value}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">Mission progress</span>
            <span className="sticker bg-xp px-2.5 py-0.5 font-mono font-extrabold text-xp-foreground">
              {progressPct}%
            </span>
          </div>
          <AnimatedProgressBar percent={progressPct} className="mt-1.5" />
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
