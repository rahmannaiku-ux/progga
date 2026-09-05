import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createBatch, deleteBatch } from "@/server/actions/admin-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 20;

export default async function AdminBatchesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireRole("ADMIN");

  const page = parsePageParam(searchParams.page);

  const [batches, total, courses] = await Promise.all([
    db.batch.findMany({
      orderBy: { startDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { course: { select: { title: true } }, _count: { select: { members: true } } },
    }),
    db.batch.count(),
    // Full, unpaginated — this feeds the <select> below, which needs
    // every course as a choice, not a page of them.
    db.course.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Batches
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cohort enrollment windows for missions run as scheduled courses.
      </p>

      <div className="mt-6 space-y-2">
        {batches.map((b) => (
          <div key={b.id} className="glass-panel flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {b.name} — {b.course.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.startDate.toLocaleDateString()}
                {b.endDate ? ` – ${b.endDate.toLocaleDateString()}` : ""} ·{" "}
                {b._count.members}
                {b.capacity ? ` / ${b.capacity}` : ""} enrolled
              </p>
            </div>
            <ConfirmDeleteButton
              action={deleteBatch.bind(null, b.id)}
              confirmMessage={`Delete batch "${b.name}"?`}
            />
          </div>
        ))}
        {batches.length === 0 && (
          <p className="text-sm text-muted-foreground">No batches yet.</p>
        )}
      </div>

      <PaginationControls page={page} totalPages={totalPages} basePath="/admin/batches" />

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Create a batch
        </h2>
        <form action={createBatch} className="mt-3 space-y-3">
          <select
            name="courseId"
            required
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          >
            <option value="">Select a mission...</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            name="name"
            required
            placeholder="Batch name, e.g. Fall 2026 Cohort"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              type="date"
              name="startDate"
              required
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            <input
              type="date"
              name="endDate"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            <input
              type="number"
              name="capacity"
              placeholder="Capacity"
              min={1}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <button
            type="submit"
            className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground"
          >
            Create batch
          </button>
        </form>
      </div>
    </div>
  );
}
