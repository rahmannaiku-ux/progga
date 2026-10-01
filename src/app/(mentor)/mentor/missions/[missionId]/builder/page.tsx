import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { isCourseMentor } from "@/lib/auth/course-access";
import { getMissionsBase } from "@/lib/mission-paths";
import { CourseStatusBadge } from "@/components/mentor-dashboard/course-status-badge";
import { PublishToggle } from "@/components/mentor-dashboard/publish-toggle";
import { ExamsToggle } from "@/components/mentor-dashboard/exams-toggle";
import { ModuleBlock } from "@/components/mentor-dashboard/module-block";
import { SubmitButton } from "@/components/shared/submit-button";
import { updateCourse } from "@/server/actions/mission-actions";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
import { ImageUploadField } from "@/components/mentor-dashboard/image-upload-field";

export default async function MissionBuilderPage({
  params,
}: {
  params: { missionId: string };
}) {
  const missionsBase = getMissionsBase();
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      routineImageUrl: true,
      slug: true,
      status: true,
      level: true,
      isFree: true,
      priceCents: true,
      examsEnabled: true,
      teacherId: true,
      modules: {
        where: { isLiveContainer: false },
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
                      thumbnailUrl: true,
                      durationSeconds: true,
                      isPreview: true,
                      scheduledStart: true,
                      scheduledEnd: true,
                      resources: { select: { id: true, title: true, url: true, type: true, downloadable: true, downloadCount: true } },
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
  if (!isAdmin && !(await isCourseMentor(course.id, user.id))) notFound();

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
        href={`${missionsBase}/${course.id}/assessments`}
        className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent/80"
      >
        Manage encounters (quizzes & exams) →
      </Link>
      <Link
        href={`${missionsBase}/${course.id}/assignments`}
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
          <ImageUploadField
            name="routineImageUrl"
            context="COURSE_ROUTINE"
            label="Class routine image"
            hint="Shown at the top of the mission page. Press Save details after choosing it."
            initialUrl={course.routineImageUrl}
          />
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
                Price in poisha (৳1 = 100)
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

      <div className="mt-8 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Build your mission</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Operation → Chapter → Class type → Patrol. Type a name and press Enter to add it, or paste a
            list (one per line) to add many at once. Tap a title to fold it away.
          </p>
        </div>

        {course.modules.length === 0 && (
          <div className="comic-panel bg-surface p-5 text-sm text-muted-foreground">
            <p className="font-display font-bold text-foreground">Start here</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Add your subjects as operations below, e.g. "Physics 1st Paper".</li>
              <li>Open one, add its chapters, then a class type such as "Foundation Class".</li>
              <li>Paste your patrols as "Title | YouTube link" lines.</li>
            </ol>
          </div>
        )}

        {course.modules.map((module, i) => (
          <ModuleBlock
            key={module.id}
            courseId={course.id}
            module={module}
            isFirst={i === 0}
            isLast={i === course.modules.length - 1}
          />
        ))}

        <div className="glass-panel p-4 sm:p-5">
          <p className="mb-2 text-sm font-semibold text-foreground">+ Add operations</p>
          <QuickAdd
            courseId={course.id}
            kind="modules"
            parentId={course.id}
            placeholder="e.g. Physics 1st Paper"
            hint="Press Enter to add. Paste a list (one operation per line) to add them all at once."
          />
        </div>
      </div>
    </div>
  );
}
