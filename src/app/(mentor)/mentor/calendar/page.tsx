import { CalendarDays } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { createMissionCalendarEvent, deleteCalendarEvent } from "@/server/actions/calendar-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";

export default async function MentorCalendarPage() {
  const mentor = await requireRole("TEACHER");
  const isAdmin = mentor.role === "ADMIN" || mentor.role === "SUPER_ADMIN";

  const [events, myCourses] = await Promise.all([
    db.calendarEvent.findMany({
      where: isAdmin ? { isGlobal: false } : { course: { teacherId: mentor.id } },
      orderBy: { startAt: "desc" },
      include: { course: { select: { title: true } } },
    }),
    db.course.findMany({
      where: isAdmin ? {} : { teacherId: mentor.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-accent" />
        <h1 className="font-display text-2xl font-extrabold text-foreground">Calendar</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Events you add here show up on the mission's calendar for every enrolled student — live
        classes and assignment due dates already appear automatically, so this is for anything
        else (a doubt-clearing session, a holiday, a deadline reminder).
      </p>

      <div className="comic-panel mt-6 bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">New event</h2>
        {myCourses.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You don't have any missions to add events to yet.
          </p>
        ) : (
          <form action={createMissionCalendarEvent} className="mt-3 space-y-3">
            <select name="courseId" required className="w-full bg-surface px-3 py-2.5 text-base text-foreground">
              {myCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <input
              name="title"
              required
              placeholder="Title"
              className="w-full bg-surface px-3 py-2.5 text-base text-foreground"
            />
            <textarea
              name="description"
              rows={2}
              placeholder="Description (optional)"
              className="w-full bg-surface px-3 py-2.5 text-base text-foreground"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Start</label>
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
              className="comic-btn w-full bg-primary px-6 py-2.5 font-display text-sm font-bold text-primary-foreground"
            >
              Add to calendar
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 space-y-2.5">
        {events.map((e) => (
          <div key={e.id} className="comic-panel flex items-start justify-between gap-3 bg-surface p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{e.title}</p>
              {e.course && (
                <span className="sticker-badge mt-1 inline-block bg-muted px-2 py-0.5 text-[10px] font-bold">
                  {e.course.title}
                </span>
              )}
              {e.description && <p className="mt-1.5 text-xs text-muted-foreground">{e.description}</p>}
              <p className="mt-1.5 text-[11px] text-muted-foreground">{formatDhakaDateTime(e.startAt)}</p>
            </div>
            <ConfirmDeleteButton
              action={deleteCalendarEvent.bind(null, e.id)}
              confirmMessage="Delete this calendar event?"
            />
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
      </div>
    </div>
  );
}
