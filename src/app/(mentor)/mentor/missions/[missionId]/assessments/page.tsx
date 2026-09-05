import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createAssessment } from "@/server/actions/assessment-actions";
import { Badge } from "@/components/ui/badge";

export default async function AssessmentsListPage({
  params,
}: {
  params: { missionId: string };
}) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    include: {
      assessments: {
        orderBy: { createdAt: "desc" },
        include: {
          lesson: { select: { title: true } },
          chapter: { select: { title: true, module: { select: { title: true } } } },
          _count: { select: { questionLinks: true, attempts: true } },
        },
      },
      modules: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              groups: {
                select: { lessons: { select: { id: true, title: true }, orderBy: { order: "asc" } } },
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

  const lessonOptions = course.modules.flatMap((m) =>
    m.chapters.flatMap((c) =>
      c.groups.flatMap((g) => g.lessons.map((l) => ({ id: l.id, title: l.title })))
    )
  );
  const chapterOptions = course.modules.flatMap((m) =>
    m.chapters.map((c) => ({ id: c.id, title: `${m.title} — ${c.title}` }))
  );

  return (
    <div className="mx-auto max-w-3xl">
      {!course.examsEnabled && (
        <div className="comic-panel mb-4 bg-xp/10 p-4 text-sm font-medium text-foreground">
          Exams aren't enabled for this mission yet.{" "}
          <Link href={`/mentor/missions/${course.id}/builder`} className="font-bold text-primary hover:text-primary/80">
            Turn them on in mission settings
          </Link>{" "}
          before publishing anything here — you can still draft encounters below in the meantime.
        </div>
      )}
      <Link
        href={`/mentor/missions/${course.id}/builder`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to builder
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
        Encounters — {course.title}
      </h1>
      <Link
        href={`/mentor/missions/${course.id}/question-bank`}
        className="mt-1 inline-block text-sm font-medium text-accent hover:text-accent/80"
      >
        Browse question bank →
      </Link>

      <div className="mt-6 space-y-3">
        {course.assessments.map((a) => (
          <Link
            key={a.id}
            href={`/mentor/missions/${course.id}/assessments/${a.id}`}
            className="glass-panel flex items-center justify-between p-5"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold text-foreground">{a.title}</p>
                <Badge variant="outline">{a.kind}</Badge>
                <Badge variant={a.publishedAt ? "accent" : "outline"}>
                  {a.publishedAt ? "Published" : "Draft"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.lesson
                  ? `Attached to "${a.lesson.title}"`
                  : a.chapter
                    ? `Chapter: ${a.chapter.module.title} — ${a.chapter.title}`
                    : "Mission-level"} ·{" "}
                {a._count.questionLinks} questions · {a._count.attempts} attempts
              </p>
            </div>
          </Link>
        ))}
        {course.assessments.length === 0 && (
          <p className="text-sm text-muted-foreground">No encounters yet.</p>
        )}
      </div>

      <div className="glass-panel mt-8 p-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Create an encounter
        </h2>
        <form action={createAssessment} className="mt-4 space-y-4">
          <input type="hidden" name="courseId" value={course.id} />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Title
            </label>
            <input
              name="title"
              required
              placeholder="e.g. Module 1 Knowledge Check"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Type
              </label>
              <select
                name="kind"
                defaultValue="QUIZ"
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              >
                <option value="QUIZ">Quiz</option>
                <option value="EXAM">Exam</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Attach to a patrol (optional)
              </label>
              <select
                name="lessonId"
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              >
                <option value="">Mission-level (not tied to one lesson)</option>
                {lessonOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Or place at a chapter (optional)
            </label>
            <select
              name="chapterId"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            >
              <option value="">No chapter placement</option>
              {chapterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shows as "📝 Chapter Exam" in the student's learning path for that chapter —
              independent of the patrol option above.
            </p>
          </div>
          <button
            type="submit"
            className="h-10 w-full comic-btn bg-primary text-sm font-bold text-primary-foreground"
          >
            Create & configure
          </button>
        </form>
      </div>
    </div>
  );
}
