import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createCalendarEvent, deleteCalendarEvent } from "@/server/actions/calendar-actions";
import { formatDhakaDateTime } from "@/lib/timezone";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 20;

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireRole("ADMIN");

  const page = parsePageParam(searchParams.page);

  const [events, total, courses] = await Promise.all([
    db.calendarEvent.findMany({
      orderBy: { startAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { course: { select: { title: true } } },
    }),
    db.calendarEvent.count(),
    db.course.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">Calendar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Events shown on every student's calendar — either platform-wide, or scoped to one
        mission. Live classes and assignment due dates already appear automatically and aren't
        listed here.
      </p>

      <div className="mt-6 space-y-2">
        {events.map((e) => (
          <div key={e.id} className="glass-panel flex items-start justify-between p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{e.title}</p>
              <span className="sticker-badge mt-1 inline-block bg-muted px-2 py-0.5 text-[10px] font-bold">
                {e.isGlobal ? "Platform-wide" : e.course?.title}
              </span>
              {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDhakaDateTime(e.startAt)}</p>
            </div>
            <ConfirmDeleteButton
              action={deleteCalendarEvent.bind(null, e.id)}
              confirmMessage="Delete this calendar event?"
            />
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
      </div>

      <PaginationControls page={page} totalPages={totalPages} basePath="/admin/calendar" />

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">New event</h2>
        <form action={createCalendarEvent} className="mt-3 space-y-3">
          <select
            name="courseId"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          >
            <option value="">Platform-wide (all students)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            name="title"
            required
            placeholder="Title"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Start (Bangladesh time)</label>
              <input
                type="datetime-local"
                name="startAt"
                required
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">End (optional)</label>
              <input
                type="datetime-local"
                name="endAt"
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground"
          >
            Add to calendar
          </button>
        </form>
      </div>
    </div>
  );
}
