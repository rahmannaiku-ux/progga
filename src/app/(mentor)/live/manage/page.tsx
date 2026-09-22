import Link from "next/link";
import { Video, Calendar, Clock, ArrowRight, Ban } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireLiveRoomEnabledOrNotFound } from "@/lib/live/flag";
import { getMentorLiveRoomClasses } from "@/server/live/live-room-service";
import { formatDhakaDate, formatDhakaTimeBST } from "@/lib/timezone";
import type { LiveRoomEntry } from "@/server/live/live-room-service";

/**
 * Teacher-facing Live Room listing, at the new /live/manage path.
 * getMentorLiveRoomClasses already includes co-teacher courses (unlike
 * the legacy /mentor/live-classes before the co-teacher fix in this
 * change) and unpublished/cancelled classes, which a mentor should
 * still be able to see and manage.
 */
export default async function LiveManageDashboardPage() {
  const user = await getCurrentUser();
  await requireLiveRoomEnabledOrNotFound(user);

  const { live, upcoming, ended } = await getMentorLiveRoomClasses(user.id);
  const isEmpty = live.length === 0 && upcoming.length === 0 && ended.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Video className="h-6 w-6 text-danger" /> Live Room — Manage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live classes across the missions you teach. Schedule new ones from a mission's builder.
        </p>
      </div>

      {isEmpty && (
        <div className="comic-panel bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">No live classes scheduled yet.</p>
        </div>
      )}

      {live.length > 0 && <Section title="Live Now" entries={live} liveDot />}
      {upcoming.length > 0 && <Section title="Upcoming" entries={upcoming} />}
      {ended.length > 0 && <Section title="Recent" entries={ended} />}
    </div>
  );
}

function Section({ title, entries, liveDot }: { title: string; entries: LiveRoomEntry[]; liveDot?: boolean }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
        {liveDot && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />} {title}
      </h2>
      <div className="space-y-3">
        {entries.map((entry) => (
          <ManageRow key={entry.liveClassId} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function ManageRow({ entry }: { entry: LiveRoomEntry }) {
  return (
    <Link
      href={`/live/manage/${entry.liveClassId}`}
      className="hover-glow-card comic-panel flex items-center justify-between gap-3 bg-surface p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-sm font-bold text-foreground">{entry.title}</p>
          {entry.state === "LIVE" && (
            <span className="sticker flex shrink-0 items-center gap-1.5 bg-danger px-2 py-0.5 text-[10px] font-extrabold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          )}
          {entry.state === "CANCELLED" && (
            <span className="sticker flex shrink-0 items-center gap-1 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              <Ban className="h-3 w-3" /> Cancelled
            </span>
          )}
          {!entry.youtubeVideoId && entry.state !== "CANCELLED" && (
            <span className="sticker flex shrink-0 items-center gap-1 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              No stream link set
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{entry.course.title}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDhakaDate(entry.scheduledStart)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatDhakaTimeBST(entry.scheduledStart)}
          </span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
