import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { CourseStatusBadge } from "@/components/mentor-dashboard/course-status-badge";
import { PublishToggle } from "@/components/mentor-dashboard/publish-toggle";
import { ExamsToggle } from "@/components/mentor-dashboard/exams-toggle";
import { ModuleBlock } from "@/components/mentor-dashboard/module-block";
import { SubmitButton } from "@/components/shared/submit-button";
import { createModule, updateCourse } from "@/server/actions/mission-actions";

export default async function MissionBuilderPage({
  params,
}: {
  params: { missionId: string };
}) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      slug: true,
      status: true,
      level: true,
      isFree: true,
      priceCents: true,
      examsEnabled: true,
      teacherId: true,
      modules: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          summary: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              groups: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  title: true,
                  lessons: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      title: true,
                      description: true,
                      youtubeVideoId: true,
                      durationSeconds: true,
                      isPreview: true,
                      scheduledStart: true,
                      scheduledEnd: true,
                      resources: { select: { id: true, title: true, url: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) notFound();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin && course.teacherId !== user.id) notFound();

  const boundCreateModule = createModule.bind(null);
  const boundUpdateCourse = updateCourse.bind(null, course.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-foreground">
              {course.title}
            </h1>
            <CourseStatusBadge status={course.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">/{course.slug}</p>
        </div>
        <PublishToggle courseId={course.id} status={course.status} />
      </div>

      <Link
        href={`/mentor/missions/${course.id}/assessments`}
        className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent/80"
      >
        Manage encounters (quizzes & exams) →
      </Link>
      <Link
        href={`/mentor/missions/${course.id}/assignments`}
        className="mt-3 ml-4 inline-block text-sm font-medium text-accent hover:text-accent/80"
      >
        Manage challenges (assignments) →
      </Link>

      <div className="comic-panel mt-4 bg-surface p-4">
        <ExamsToggle courseId={course.id} enabled={course.examsEnabled} />
      </div>

      <details className="glass-panel mt-6 p-5">
        <summary className="cursor-pointer list-none font-display text-sm font-bold text-foreground">
          Mission details
        </summary>
        <form action={boundUpdateCourse} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Title
            </label>
            <input
              name="title"
              defaultValue={course.title}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Subtitle
            </label>
            <input
              name="subtitle"
              defaultValue={course.subtitle ?? ""}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Description
            </label>
            <textarea
              name="description"
              defaultValue={course.description}
              rows={4}
              className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Level
              </label>
              <select
                name="level"
                defaultValue={course.level}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
                <option value="ALL_LEVELS">All levels</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Price (cents)
              </label>
              <input
                type="number"
                name="priceCents"
                defaultValue={course.priceCents}
                min={0}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="isFree" defaultChecked={course.isFree} />
            This mission is free
          </label>
          <SubmitButton
            pendingLabel="Saving…"
            className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Save details
          </SubmitButton>
        </form>
      </details>

      <div className="mt-8 space-y-5">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Operations (modules)
        </h2>

        {course.modules.map((module, i) => (
          <ModuleBlock
            key={module.id}
            courseId={course.id}
            module={module}
            isFirst={i === 0}
            isLast={i === course.modules.length - 1}
          />
        ))}

        <div className="glass-panel p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">
            + Add an operation
          </p>
          <form action={boundCreateModule} className="space-y-2">
            <input type="hidden" name="courseId" value={course.id} />
            <input
              name="title"
              required
              placeholder="e.g. Getting Started"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            <input
              name="summary"
              placeholder="Short summary (optional)"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            <SubmitButton
              pendingLabel="Adding…"
              className="h-10 w-full comic-btn bg-primary text-sm font-bold text-primary-foreground"
            >
              Add operation
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
