import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createAssignment, deleteAssignment } from "@/server/actions/assignment-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { RubricBuilder } from "@/components/mentor-dashboard/rubric-builder";

export default async function AssignmentsListPage({
  params,
}: {
  params: { missionId: string };
}) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        select: {
          chapters: {
            select: {
              groups: {
                select: {
                  lessons: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      title: true,
                      assignments: {
                        include: { _count: { select: { submissions: true } } },
                      },
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

  const lessons = course.modules.flatMap((m) =>
    m.chapters.flatMap((c) => c.groups.flatMap((g) => g.lessons))
  );
  const allAssignments = lessons.flatMap((l) =>
    l.assignments.map((a) => ({ ...a, lessonTitle: l.title }))
  );
  const boundDelete = (assignmentId: string) => deleteAssignment.bind(null, course.id, assignmentId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/mentor/missions/${course.id}/builder`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to builder
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
        Challenges — {course.title}
      </h1>

      <div className="mt-6 space-y-3">
        {allAssignments.map((a) => (
          <div key={a.id} className="glass-panel flex items-center justify-between p-5">
            <div>
              <p className="font-display font-semibold text-foreground">{a.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Attached to "{a.lessonTitle}" · {a.maxPoints} pts ·{" "}
                {a._count.submissions} submission{a._count.submissions === 1 ? "" : "s"}
                {a.dueAt && ` · due ${a.dueAt.toLocaleDateString()}`}
              </p>
            </div>
            <ConfirmDeleteButton
              action={boundDelete(a.id)}
              confirmMessage={`Delete "${a.title}"? Submissions will be removed too.`}
            />
          </div>
        ))}
        {allAssignments.length === 0 && (
          <p className="text-sm text-muted-foreground">No challenges yet.</p>
        )}
      </div>

      <div className="glass-panel mt-8 p-6">
        <h2 className="font-display text-base font-semibold text-foreground">
          Create a challenge
        </h2>
        <form action={createAssignment} className="mt-4 space-y-4">
          <input type="hidden" name="courseId" value={course.id} />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Title
            </label>
            <input
              name="title"
              required
              placeholder="e.g. Build a Responsive Landing Page"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Instructions
            </label>
            <textarea
              name="instructions"
              required
              rows={4}
              placeholder="What should students submit, and how will it be judged?"
              className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Attach to a patrol
            </label>
            <select
              name="lessonId"
              required
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            >
              <option value="">Select a patrol...</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Due date (optional)
              </label>
              <input
                type="date"
                name="dueAt"
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Max points
              </label>
              <input
                type="number"
                name="maxPoints"
                defaultValue={100}
                min={1}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="allowLateSubmission" defaultChecked />
            Allow late submissions
          </label>

          <RubricBuilder />

          <div className="rounded-lg border border-border/40 p-3">
            <p className="mb-2 text-xs font-bold text-foreground">Proggy Coin reward (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">🪙 Coins</label>
                <input
                  type="number"
                  name="coinReward"
                  min={0}
                  defaultValue={0}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Bonus XP</label>
                <input
                  type="number"
                  name="xpReward"
                  min={0}
                  defaultValue={0}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Max claims</label>
                <input
                  type="number"
                  name="maxRewardClaims"
                  min={1}
                  placeholder="Unlimited"
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Awarded once per student on a graded passing submission (50%+).
            </p>
          </div>

          <button
            type="submit"
            className="h-10 w-full comic-btn bg-primary text-sm font-bold text-primary-foreground"
          >
            Create challenge
          </button>
        </form>
      </div>
    </div>
  );
}
