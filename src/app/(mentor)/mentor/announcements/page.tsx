import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createMissionAnnouncement, deleteMentorAnnouncement } from "@/server/actions/mentor-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";

export default async function MentorAnnouncementsPage() {
  const mentor = await requireRole("TEACHER");
  const isAdmin = mentor.role === "ADMIN" || mentor.role === "SUPER_ADMIN";

  const [announcements, myCourses] = await Promise.all([
    db.announcement.findMany({
      where: isAdmin ? { isGlobal: false } : { course: { teacherId: mentor.id } },
      orderBy: { createdAt: "desc" },
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
        <Megaphone className="h-6 w-6 text-accent" />
        <h1 className="font-display text-2xl font-extrabold text-foreground">Announcements</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Sent as a notification to every student currently enrolled in the mission you pick.
      </p>

      <div className="comic-panel mt-6 bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">New announcement</h2>
        {myCourses.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">You don't have any missions to announce to yet.</p>
        ) : (
          <form action={createMissionAnnouncement} className="mt-3 space-y-3">
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
              name="body"
              required
              rows={3}
              placeholder="Message"
              className="w-full bg-surface px-3 py-2.5 text-base text-foreground"
            />
            <button
              type="submit"
              className="comic-btn w-full bg-primary px-6 py-2.5 font-display text-sm font-bold text-primary-foreground"
            >
              Send to enrolled students
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 space-y-2.5">
        {announcements.map((a) => (
          <div key={a.id} className="comic-panel flex items-start justify-between gap-3 bg-surface p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{a.title}</p>
              {a.course && (
                <span className="sticker-badge mt-1 inline-block bg-muted px-2 py-0.5 text-[10px] font-bold">
                  {a.course.title}
                </span>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">{a.body}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{a.createdAt.toLocaleString()}</p>
            </div>
            <ConfirmDeleteButton
              action={deleteMentorAnnouncement.bind(null, a.id)}
              confirmMessage="Delete this announcement?"
            />
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        )}
      </div>
    </div>
  );
}
