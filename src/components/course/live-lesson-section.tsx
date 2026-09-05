"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { getLiveClassStatus, effectiveEndTime, formatDuration } from "@/lib/live-classes";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { LiveClassPlayer } from "@/components/course/live-class-player";
import { LessonPlayer } from "@/components/course/lesson-player";

/**
 * The live-lesson equivalent of LessonPlayer while a class is
 * upcoming or live — no resume position, no progress polling, no
 * completion state, no custom playback controls, and the YouTube
 * iframe only mounts once the status is actually LIVE.
 *
 * Once the class has ENDED, this hands off to the normal LessonPlayer
 * (same resumable, progress-tracked flow as any recorded lesson)
 * instead of dead-ending on a static "Class Ended" message — the
 * same youtubeVideoId is still a valid watchable recording, and
 * there's no reason a taught class should become unwatchable content
 * forever the moment the scheduled window closes.
 */
export function LiveLessonSection({
  lessonId,
  title,
  youtubeVideoId,
  scheduledStart,
  scheduledEnd,
  serverNow,
  resumeAtSeconds,
  isCompleted,
}: {
  lessonId: string;
  title: string;
  youtubeVideoId: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  serverNow: Date;
  resumeAtSeconds: number;
  isCompleted: boolean;
}) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = getLiveClassStatus(scheduledStart, scheduledEnd, now);
  const end = effectiveEndTime(scheduledStart, scheduledEnd);

  if (!youtubeVideoId) {
    return (
      <div className="comic-panel flex aspect-video flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
        <span className="sticker bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
          Stream Not Set Up Yet
        </span>
        <p className="text-sm text-muted-foreground">
          This live class doesn't have a stream link yet — check back closer to the scheduled time.
        </p>
      </div>
    );
  }

  if (status === "LIVE") {
    return (
      <LiveClassPlayer
        youtubeVideoId={youtubeVideoId}
        title={title}
        posterUrl={youtubeThumbnailUrl(youtubeVideoId)}
      />
    );
  }

  if (status === "ENDED") {
    return (
      <div>
        <div className="comic-panel mb-3 flex items-center gap-2 bg-surface px-4 py-2.5">
          <span className="sticker bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            Recording
          </span>
          <p className="text-xs text-muted-foreground">
            This live class ended {formatDuration(now.getTime() - end.getTime())} ago — you're
            watching the recording.
          </p>
        </div>
        <LessonPlayer
          lessonId={lessonId}
          youtubeVideoId={youtubeVideoId}
          resumeAtSeconds={resumeAtSeconds}
          isCompleted={isCompleted}
        />
      </div>
    );
  }

  return (
    <div className="comic-panel flex aspect-video flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
      <span className="sticker bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary">
        Upcoming Live Class
      </span>
      <p className="font-mono text-lg font-bold text-foreground">
        Starts in {formatDuration(scheduledStart.getTime() - now.getTime())}
      </p>
      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" suppressHydrationWarning>
          <Calendar className="h-3.5 w-3.5" /> {scheduledStart.toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1" suppressHydrationWarning>
          <Clock className="h-3.5 w-3.5" />
          {scheduledStart.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          })}
        </span>
      </p>
    </div>
  );
}
