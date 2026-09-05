import Link from "next/link";
import { Video, ArrowRight } from "lucide-react";
import { formatDuration } from "@/lib/live-classes";
import type { StudentLiveClass } from "@/server/services/live-classes";

/**
 * Dashboard-only summary card — deliberately static (computed once at
 * render time, no client ticker, no polling). Links straight to the
 * specific class's real lesson page (same route as any other patrol),
 * not through an intermediate directory — same "go straight to the
 * thing" reasoning as the Resume Lesson fix.
 */
export function DashboardLiveClassCard({
  live,
  nextUpcoming,
  now,
}: {
  live: StudentLiveClass | null;
  nextUpcoming: StudentLiveClass | null;
  now: Date;
}) {
  if (!live && !nextUpcoming) return null;
  const target = live ?? nextUpcoming!;

  return (
    <Link
      href={target.href}
      prefetch={false}
      className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-3.5"
    >
      {live ? (
        <>
          <span className="sticker flex shrink-0 items-center gap-1.5 bg-danger px-2.5 py-1.5 text-[11px] font-extrabold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-foreground">{live.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {live.course.title}
            </span>
          </span>
        </>
      ) : (
        nextUpcoming && (
          <>
            <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-primary/15 text-primary">
              <Video className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-foreground">
                {nextUpcoming.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Starts in {formatDuration(nextUpcoming.scheduledStart.getTime() - now.getTime())}
              </span>
            </span>
          </>
        )
      )}
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
