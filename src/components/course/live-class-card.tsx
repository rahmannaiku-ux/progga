"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, CalendarPlus, Clock, User, Play, Radio } from "lucide-react";
import { getLiveClassStatus, effectiveEndTime, formatDuration, googleCalendarUrl } from "@/lib/live-classes";
import { formatDhakaDate, formatDhakaTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
import type { StudentLiveClass } from "@/server/services/live-classes";

/**
 * One class on /live-classes: when it is, who teaches it, a live countdown, and the one thing to
 * do now: join while it's live, add it to the calendar before, watch the recording after.
 * Playback itself happens on the patrol page (or the Live Room), never here.
 */
export function LiveClassCard({
  liveClass,
  serverNow,
}: {
  liveClass: StudentLiveClass;
  serverNow: Date;
}) {
  // Counts from the server's clock, so a phone with the wrong time still shows the right countdown.
  const [offset] = useState(() => serverNow.getTime() - Date.now());
  const [now, setNow] = useState<Date>(serverNow);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(id);
  }, [offset]);

  const status = getLiveClassStatus(liveClass.scheduledStart, liveClass.scheduledEnd, now);
  const end = effectiveEndTime(liveClass.scheduledStart, liveClass.scheduledEnd);
  const teacherName = `${liveClass.course.teacher.firstName} ${liveClass.course.teacher.lastName}`.trim();
  const startsInMs = liveClass.scheduledStart.getTime() - now.getTime();
  const soon = status === "UPCOMING" && startsInMs < 30 * 60 * 1000;

  return (
    <article
      className={cn(
        "comic-panel relative bg-surface p-4 transition-colors",
        status === "LIVE" ? "border-danger/60 ring-2 ring-danger/20" : "hover:border-primary/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 font-display text-sm font-bold text-foreground">
          {/* The whole card opens the class; the calendar link sits above this overlay. */}
          <Link href={liveClass.href} className="after:absolute after:inset-0 after:content-['']">
            {liveClass.title}
          </Link>
        </h3>
        {status === "LIVE" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold text-danger-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
        )}
        {!liveClass.youtubeVideoId && status !== "ENDED" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Stream link not added yet</span>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">{liveClass.course.title}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {teacherName && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" aria-hidden="true" /> {teacherName}
          </span>
        )}
        <span className="flex items-center gap-1" suppressHydrationWarning>
          <Calendar className="h-3 w-3" aria-hidden="true" /> {formatDhakaDate(liveClass.scheduledStart)}
        </span>
        <span className="flex items-center gap-1" suppressHydrationWarning>
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatDhakaTime(liveClass.scheduledStart)} – {formatDhakaTime(end)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn("font-mono text-xs font-bold", status === "LIVE" ? "text-danger" : soon ? "text-danger" : "text-primary")}
          suppressHydrationWarning
        >
          {status === "LIVE"
            ? "Happening now"
            : status === "UPCOMING"
              ? `Starts in ${formatDuration(startsInMs)}`
              : `Ended ${formatDuration(now.getTime() - end.getTime())} ago`}
        </p>
        <div className="relative z-10 flex items-center gap-2">
          {status === "UPCOMING" && (
            <a
              href={googleCalendarUrl({
                title: liveClass.title,
                start: liveClass.scheduledStart,
                end,
                details: `${liveClass.course.title}${teacherName ? ` with ${teacherName}` : ""} on Proggaa.`,
                url: `${CANONICAL_SITE_URL}${liveClass.href}`,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/30 px-3 text-xs font-semibold text-foreground hover:border-primary/50"
            >
              <CalendarPlus className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Add to calendar
            </a>
          )}
          <Link
            href={liveClass.href}
            className={cn(
              "comic-btn inline-flex min-h-9 items-center gap-1.5 px-3.5 text-xs font-bold",
              status === "LIVE" ? "bg-danger text-danger-foreground" : "bg-primary text-primary-foreground"
            )}
          >
            {status === "LIVE" ? (
              <>
                <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Join now
              </>
            ) : status === "ENDED" ? (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" /> {liveClass.youtubeVideoId ? "Watch recording" : "Open"}
              </>
            ) : (
              "Open"
            )}
          </Link>
        </div>
      </div>
    </article>
  );
}
