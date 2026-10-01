import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, FileText, PlayCircle, User } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { driveThumbnailUrl } from "@/lib/google-embed";
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
              select: { id: true, title: true, courseId: true, course: { select: { slug: true, title: true, teacher: { select: { firstName: true, lastName: true } } } } },
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

  const teacher = group.chapter.module.course.teacher;
  const mentorName = `${teacher.firstName} ${teacher.lastName}`.trim() || "Mentor";

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
            const thumb =
              driveThumbnailUrl(lesson.thumbnailUrl) ??
              (lesson.youtubeVideoId ? `https://i.ytimg.com/vi/${lesson.youtubeVideoId}/hqdefault.jpg` : null);
            return (
              <div
                key={lesson.id}
                className="comic-panel relative flex items-center gap-3 bg-surface p-2.5 transition-colors hover:border-primary/50 sm:gap-4 sm:p-3"
              >
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted sm:w-44">
                  {thumb ? (
                    // Plain <img>: Drive thumbnails come from changing Google hosts, which next/image can't allow-list.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary/10">
                      <PlayCircle className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  {isCompleted && (
                    <span className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5">
                      <CheckCircle2 className="h-4 w-4 text-accent" aria-label="Completed" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`${basePath}/patrols/${lesson.id}`}
                    prefetch={false}
                    className="line-clamp-2 font-display text-sm font-bold text-foreground after:absolute after:inset-0 after:content-[''] sm:text-base"
                  >
                    {lesson.title}
                  </Link>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" /> {mentorName}
                  </p>
                  {lesson.resources.length > 0 && (
                    <Link
                      href={`${basePath}/patrols/${lesson.id}#resources`}
                      prefetch={false}
                      className={cn(
                        "comic-btn relative z-10 mt-2 inline-flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs font-bold text-foreground"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" /> Notes
                    </Link>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
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
