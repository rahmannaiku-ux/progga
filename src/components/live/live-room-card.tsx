"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, User, ArrowRight, Ban } from "lucide-react";
import { formatDuration } from "@/lib/live-classes";
import { formatDhakaDate, formatDhakaTimeBST } from "@/lib/timezone";
import type { LiveRoomEntry } from "@/server/live/live-room-service";

/**
 * /live dashboard list item. Same visual language as the legacy
 * LiveClassCard (comic-panel, sticker LIVE badge, Dhaka date/time), but
 * driven by the real LiveClass.state instead of deriving status purely
 * from the clock -- an early-started or overrunning class shows
 * correctly here. Links to the new room at /live/[liveClassId].
 */
export function LiveRoomCard({ entry, serverNow }: { entry: LiveRoomEntry; serverNow: Date }) {
  const [now, setNow] = useState<Date>(serverNow);

  useEffect(() => {
    if (entry.state !== "SCHEDULED") return; // only the countdown needs a ticking clock
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [entry.state]);

  const teacherName = `${entry.course.teacher.firstName} ${entry.course.teacher.lastName}`;

  return (
    <Link
      href={`/live/${entry.liveClassId}`}
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
              Stream not set up yet
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{entry.course.title}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" /> {teacherName}
          </span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Calendar className="h-3 w-3" /> {formatDhakaDate(entry.scheduledStart)}
          </span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Clock className="h-3 w-3" /> {formatDhakaTimeBST(entry.scheduledStart)}
          </span>
        </div>

        {entry.state === "SCHEDULED" && (
          <p className="mt-1.5 font-mono text-xs font-bold text-primary">
            Starts in {formatDuration(entry.scheduledStart.getTime() - now.getTime())}
          </p>
        )}
        {entry.state === "ENDED" && (
          <p className="mt-1.5 text-xs text-muted-foreground">Class ended</p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
