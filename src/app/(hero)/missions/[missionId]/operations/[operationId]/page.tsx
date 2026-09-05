import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Layers } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

/** Chapters within a Subject (Module) — step 2 of the drill-down. */
export default async function SubjectChaptersPage({
  params,
}: {
  params: { missionId: string; operationId: string };
}) {
  const user = await getCurrentUser();

  // Cheap existence + enrollment check first — avoids fetching the full
  // chapter/group/lesson tree below only to redirect it away.
  await assertCourseEnrollment(user.id, params.missionId);

  const [mod, enrollment] = await Promise.all([
    db.module.findUnique({
      where: { id: params.operationId },
      include: {
        course: { select: { id: true, slug: true, title: true } },
        chapters: {
          orderBy: { order: "asc" },
          include: {
            groups: {
              select: { id: true, lessons: { select: { id: true } } },
            },
          },
        },
      },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
  ]);
  if (!mod || mod.course.id !== params.missionId) notFound();
  if (!enrollment) redirect(`/courses/${mod.course.slug}`);

  const lessonIds = mod.chapters.flatMap((c) => c.groups.flatMap((g) => g.lessons.map((l) => l.id)));
  const completedCount = lessonIds.length
    ? await db.lessonProgress.count({
        where: { userId: user.id, lessonId: { in: lessonIds }, isCompleted: true },
      })
    : 0;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <CourseBreadcrumb
          steps={[
            { label: mod.course.title, href: `/missions/${mod.course.id}` },
            { label: mod.title },
          ]}
        />
      </StaggerItem>

      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">{mod.title}</h1>
        {mod.summary && <p className="mt-1.5 text-sm text-muted-foreground">{mod.summary}</p>}
        {lessonIds.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {completedCount}/{lessonIds.length} patrols complete
          </p>
        )}
      </StaggerItem>

      <StaggerItem as="section">
        <h2 className="font-display text-lg font-bold text-foreground">Chapters</h2>
        <div className="mt-3 space-y-2.5">
          {mod.chapters.map((chapter) => {
            const chapterLessonCount = chapter.groups.reduce((s, g) => s + g.lessons.length, 0);
            return (
              <Link
                key={chapter.id}
                href={`/missions/${mod.course.id}/operations/${mod.id}/chapters/${chapter.id}`}
                prefetch={false}
                className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-4"
              >
                <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-accent/15 text-accent">
                  <Layers className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {chapter.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {chapter.groups.length} class type{chapter.groups.length === 1 ? "" : "s"} ·{" "}
                    {chapterLessonCount} patrol{chapterLessonCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}

          {mod.chapters.length === 0 && (
            <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-8 text-center">
              <ProggyMascot state="thinking" className="h-14 w-14" />
              <p className="text-sm text-muted-foreground">
                No chapters added to this subject yet.
              </p>
            </div>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
