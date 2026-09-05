import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Video, GraduationCap, Clock3, ListChecks } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCourseEnrollment } from "@/lib/auth/enrollment-guard";
import { db } from "@/lib/db/client";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

/**
 * Class types within a Chapter — step 3 of the drill-down. These are
 * entirely teacher-authored per chapter (e.g. "Foundation Class",
 * "Archive Class", "Live Batch") rather than a fixed set, so titles and
 * ordering come straight from what the teacher set up in the builder.
 */
export default async function ChapterGroupsPage({
  params,
}: {
  params: { missionId: string; operationId: string; chapterId: string };
}) {
  const user = await getCurrentUser();

  // Cheap existence + enrollment check first — avoids fetching the
  // chapter/groups/assessments tree below only to redirect it away.
  await assertCourseEnrollment(user.id, params.missionId);

  const [chapter, enrollment] = await Promise.all([
    db.chapter.findUnique({
      where: { id: params.chapterId },
      include: {
        module: { select: { id: true, title: true, courseId: true, course: { select: { slug: true, title: true } } } },
        groups: {
          orderBy: { order: "asc" },
          include: { lessons: { select: { id: true } } },
        },
        // Chapter-placed exams (PHASE 4/7/18) — shown as their own
        // "📝 Chapter Exam" entries, distinct from the Class Type list
        // below, since an exam here has no Lesson/Patrol row at all.
        assessments: {
          where: { publishedAt: { not: null } },
          orderBy: { createdAt: "asc" },
          include: {
            _count: { select: { questionLinks: true } },
            attempts: {
              where: { userId: user.id },
              orderBy: { startedAt: "desc" },
              select: { id: true, status: true },
            },
          },
        },
      },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
  ]);
  if (
    !chapter ||
    chapter.module.courseId !== params.missionId ||
    chapter.module.id !== params.operationId
  ) {
    notFound();
  }
  if (!enrollment) redirect(`/courses/${chapter?.module.course.slug ?? params.missionId}`);

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <CourseBreadcrumb
          steps={[
            { label: chapter.module.course.title, href: `/missions/${chapter.module.courseId}` },
            {
              label: chapter.module.title,
              href: `/missions/${chapter.module.courseId}/operations/${chapter.module.id}`,
            },
            { label: chapter.title },
          ]}
        />
      </StaggerItem>

      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">{chapter.title}</h1>
      </StaggerItem>

      {chapter.assessments.length > 0 && (
        <StaggerItem as="section">
          <h2 className="font-display text-lg font-bold text-foreground">📝 Chapter Exam</h2>
          <div className="mt-3 space-y-2.5">
            {chapter.assessments.map((a) => {
              const inProgress = a.attempts.find((att) => att.status === "IN_PROGRESS");
              const completed = a.attempts.some((att) => att.status === "GRADED" || att.status === "SUBMITTED");
              return (
                <Link
                  key={a.id}
                  href={`/encounters/${a.id}`}
                  className="hover-glow-card comic-panel flex items-center gap-3 bg-xp/10 p-4"
                >
                  <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-xp/20 text-xp-foreground">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-foreground">{a.title}</p>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> {a._count.questionLinks} questions
                      </span>
                      {a.timeLimitSeconds && (
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3 w-3" /> {Math.round(a.timeLimitSeconds / 60)} min
                        </span>
                      )}
                      {inProgress && <span className="font-semibold text-xp-foreground">In progress</span>}
                      {!inProgress && completed && <span className="font-semibold text-primary">Completed</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </StaggerItem>
      )}

      <StaggerItem as="section">
        <h2 className="font-display text-lg font-bold text-foreground">Class type</h2>
        <div className="mt-3 space-y-2.5">
          {chapter.groups.map((group) => (
            <Link
              key={group.id}
              href={`/missions/${chapter.module.courseId}/operations/${chapter.module.id}/chapters/${chapter.id}/groups/${group.id}`}
              prefetch={false}
              className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-4"
            >
              <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-xp/15 text-xp">
                <Video className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-foreground">
                  {group.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {group.lessons.length} patrol{group.lessons.length === 1 ? "" : "s"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}

          {chapter.groups.length === 0 && (
            <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-8 text-center">
              <ProggyMascot state="thinking" className="h-14 w-14" />
              <p className="text-sm text-muted-foreground">
                Coming soon — no class types added to this chapter yet.
              </p>
            </div>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
