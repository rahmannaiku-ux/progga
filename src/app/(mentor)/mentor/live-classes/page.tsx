import Link from "next/link";
import { Video, Calendar, Clock, ArrowRight, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMentorLiveClasses } from "@/server/services/mentor-live-classes";
import { formatDhakaDate, formatDhakaTime } from "@/lib/timezone";

export default async function MentorLiveClassesPage() {
  const user = await getCurrentUser();
  const { live, upcoming, ended } = await getMentorLiveClasses(user.id);
  const isEmpty = live.length === 0 && upcoming.length === 0 && ended.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <Video className="h-6 w-6 text-danger" /> Live Classes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every live class scheduled across your missions.
          </p>
        </div>
        <Link
          href="/mentor/missions"
          className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Schedule one
        </Link>
      </div>

      {isEmpty && (
        <div className="comic-panel bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No live classes scheduled yet. Add one from a mission's builder — put it in a "Live"
            class type alongside your recorded lessons.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Live Now
          </h2>
          <div className="space-y-3">
            {live.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} badge="LIVE" />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} />
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent</h2>
          <div className="space-y-3">
            {ended.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MentorLiveClassRow({
  lc,
  badge,
}: {
  lc: {
    id: string;
    title: string;
    youtubeVideoId: string | null;
    scheduledStart: Date;
    course: { title: string };
    href: string;
  };
  badge?: string;
}) {
  return (
    <Link
      href={lc.href}
      prefetch={false}
      className="hover-glow-card comic-panel flex items-center justify-between gap-3 bg-surface p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-sm font-bold text-foreground">{lc.title}</p>
          {badge && (
            <span className="sticker flex shrink-0 items-center gap-1.5 bg-danger px-2 py-0.5 text-[10px] font-extrabold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {badge}
            </span>
          )}
          {!lc.youtubeVideoId && (
            <span className="sticker flex shrink-0 items-center gap-1 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              No stream link set
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{lc.course.title}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDhakaDate(lc.scheduledStart)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDhakaTime(lc.scheduledStart)}
          </span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
