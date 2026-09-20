"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, User, ArrowRight } from "lucide-react";
import { getLiveClassStatus, effectiveEndTime, formatDuration } from "@/lib/live-classes";
import { formatDhakaDate, formatDhakaTime } from "@/lib/timezone";
import type { StudentLiveClass } from "@/server/services/live-classes";

/**
 * Card for the /live-classes directory listing. Deliberately does NOT
 * embed LiveClassPlayer inline anymore — now that a live class is a
 * real Lesson at a real patrol URL, clicking through to that page (
 * which renders LiveLessonSection) is the single place playback
 * happens, instead of duplicating status/player logic in two places.
 */
export function LiveClassCard({
  liveClass,
  serverNow,
}: {
  liveClass: StudentLiveClass;
  serverNow: Date;
}) {
  const [now, setNow] = useState<Date>(serverNow);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = getLiveClassStatus(liveClass.scheduledStart, liveClass.scheduledEnd, now);
  const end = effectiveEndTime(liveClass.scheduledStart, liveClass.scheduledEnd);
  const teacherName = `${liveClass.course.teacher.firstName} ${liveClass.course.teacher.lastName}`;

  return (
    <Link
      href={liveClass.href}
      className="hover-glow-card comic-panel flex items-center justify-between gap-3 bg-surface p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-display text-sm font-bold text-foreground">{liveClass.title}</p>
          {status === "LIVE" && (
            <span className="sticker flex shrink-0 items-center gap-1.5 bg-danger px-2 py-0.5 text-[10px] font-extrabold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          )}
          {!liveClass.youtubeVideoId && (
            <span className="sticker flex shrink-0 items-center gap-1 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              Stream not set up yet
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{liveClass.course.title}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" /> {teacherName}
          </span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Calendar className="h-3 w-3" /> {formatDhakaDate(liveClass.scheduledStart)}
          </span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Clock className="h-3 w-3" />
            {formatDhakaTime(liveClass.scheduledStart, { timeZoneName: "short" })}
          </span>
        </div>

        {status === "UPCOMING" && (
          <p className="mt-1.5 font-mono text-xs font-bold text-primary">
            Starts in {formatDuration(liveClass.scheduledStart.getTime() - now.getTime())}
          </p>
        )}
        {status === "ENDED" && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Ended {formatDuration(now.getTime() - end.getTime())} ago
          </p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
