import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle, PlayCircle, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { cn } from "@/lib/utils";

/** Lessons within a class type — step 4, the last stop before the player. */
export default async function LessonGroupLessonsPage({
  params,
}: {
  params: { missionId: string; operationId: string; chapterId: string; groupId: string };
}) {
  const user = await getCurrentUser();

  // Cheap existence + enrollment check first — avoids fetching the
  // lessons/resources tree below only to redirect it away.
  await assertCourseEnrollment(user.id, params.missionId);

  const [group, enrollment] = await Promise.all([
    db.lessonGroup.findUnique({
      where: { id: params.groupId },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            module: {
              select: { id: true, title: true, courseId: true, course: { select: { slug: true, title: true } } },
            },
          },
        },
        lessons: {
          orderBy: { order: "asc" },
          include: { resources: { select: { id: true, type: true } } },
        },
      },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
  ]);
  if (
    !group ||
    group.chapter.id !== params.chapterId ||
    group.chapter.module.id !== params.operationId ||
    group.chapter.module.courseId !== params.missionId
  ) {
    notFound();
  }
  if (!enrollment) redirect(`/courses/${group?.chapter.module.course.slug ?? params.missionId}`);

  const progressRows = group.lessons.length
    ? await db.lessonProgress.findMany({
        where: { userId: user.id, lessonId: { in: group.lessons.map((l) => l.id) } },
        select: { lessonId: true, isCompleted: true },
      })
    : [];
  const completedIds = new Set(progressRows.filter((p) => p.isCompleted).map((p) => p.lessonId));

  const basePath = `/missions/${group.chapter.module.courseId}/operations/${group.chapter.module.id}/chapters/${group.chapter.id}/groups/${group.id}`;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <CourseBreadcrumb
          steps={[
            {
              label: group.chapter.module.course.title,
              href: `/missions/${group.chapter.module.courseId}`,
            },
            {
              label: group.chapter.module.title,
              href: `/missions/${group.chapter.module.courseId}/operations/${group.chapter.module.id}`,
            },
            {
              label: group.chapter.title,
              href: `/missions/${group.chapter.module.courseId}/operations/${group.chapter.module.id}/chapters/${group.chapter.id}`,
            },
            { label: group.title },
          ]}
        />
      </StaggerItem>

      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">{group.title}</h1>
      </StaggerItem>

      <StaggerItem as="section">
        <div className="space-y-2.5">
          {group.lessons.map((lesson) => {
            const isCompleted = completedIds.has(lesson.id);
            return (
              <div key={lesson.id} className="comic-panel bg-surface p-4">
                <div className="flex items-start gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-foreground">
                    {lesson.title}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`${basePath}/patrols/${lesson.id}`}
                    prefetch={false}
                    className={cn(
                      "comic-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold",
                      isCompleted
                        ? "bg-surface text-foreground"
                        : "bg-primary text-primary-foreground"
                    )}
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Video
                  </Link>
                  {lesson.resources.length > 0 && (
                    <Link
                      href={`${basePath}/patrols/${lesson.id}#resources`}
                      prefetch={false}
                      className="comic-btn inline-flex items-center gap-1.5 bg-surface px-4 py-2 text-xs font-bold text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" /> Notes
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          {group.lessons.length === 0 && (
            <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-8 text-center">
              <ProggyMascot state="thinking" className="h-14 w-14" />
              <p className="text-sm text-muted-foreground">
                Coming soon — no patrols added to this class yet.
              </p>
            </div>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
