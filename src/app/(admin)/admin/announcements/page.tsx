import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createGlobalAnnouncement, deleteAnnouncement } from "@/server/actions/admin-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 20;

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireRole("ADMIN");

  const page = parsePageParam(searchParams.page);

  const [announcements, total] = await Promise.all([
    db.announcement.findMany({
      where: { isGlobal: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.announcement.count({ where: { isGlobal: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Announcements
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sent as a notification to every active user.
      </p>

      <div className="mt-6 space-y-2">
        {announcements.map((a) => (
          <div key={a.id} className="glass-panel flex items-start justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">{a.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {a.createdAt.toLocaleString()}
              </p>
            </div>
            <ConfirmDeleteButton
              action={deleteAnnouncement.bind(null, a.id)}
              confirmMessage="Delete this announcement?"
            />
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        )}
      </div>

      <PaginationControls page={page} totalPages={totalPages} basePath="/admin/announcements" />

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          New announcement
        </h2>
        <form action={createGlobalAnnouncement} className="mt-3 space-y-3">
          <input
            name="title"
            required
            placeholder="Title"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Message"
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
          />
          <button
            type="submit"
            className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground"
          >
            Send to all users
          </button>
        </form>
      </div>
    </div>
  );
}
