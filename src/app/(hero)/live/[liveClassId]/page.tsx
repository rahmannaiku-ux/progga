import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireLiveRoomEnabledOrNotFound } from "@/lib/live/flag";
import { assertCanJoinLiveRoom } from "@/server/live/live-access";
import { db } from "@/lib/db/client";
import { resolveLiveClassState, type LiveSchedule } from "@/lib/live/state";
import { LiveRoomVideo } from "@/components/live/live-room-video";
import { LiveChatPanel } from "@/components/live/live-chat-panel";
import { AttendanceTracker } from "@/components/live/attendance-tracker";
import { formatDhakaDateTimeBST } from "@/lib/timezone";

/**
 * The student Live Room. Desktop: video + a fixed 360px chat column
 * (grid, not flex, so the chat column never shrinks the video below
 * its aspect ratio). Mobile: video stays at the top (sticky is left to
 * the video's own component since fullscreen needs to cover only the
 * video, not chat -- see LiveClassPlayer's existing fullscreen
 * handling, untouched here), chat and its input follow below, clear of
 * the fixed bottom nav via the layout's existing pb-24.
 */
export default async function LiveRoomPage({ params }: { params: { liveClassId: string } }) {
  const user = await getCurrentUser();
  await requireLiveRoomEnabledOrNotFound(user);

  const access = await assertCanJoinLiveRoom(params.liveClassId, user);
  if (!access.ok) {
    if (access.reason === "NOT_FOUND") notFound();
    // NOT_ENROLLED / CANCELLED / BANNED / RATE_LIMITED all land here as
    // a plain message rather than a 404 -- the class exists, the
    // visitor just can't join it right now.
    return (
      <div className="comic-panel mx-auto mt-12 max-w-md bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {access.reason === "CANCELLED"
            ? "This class was cancelled."
            : access.reason === "BANNED"
              ? "You've been removed from this live class."
              : access.reason === "RATE_LIMITED"
                ? "Too many attempts — please wait a moment and try again."
                : "You need to be enrolled in this course to join."}
        </p>
      </div>
    );
  }

  const liveClass = access.liveClass;
  const lesson = await db.lesson.findUnique({
    where: { id: liveClass.lessonId },
    select: {
      title: true,
      youtubeVideoId: true,
      scheduledStart: true,
      scheduledEnd: true,
      group: { select: { chapter: { select: { module: { select: { course: { select: { title: true } } } } } } } },
    },
  });
  if (!lesson?.scheduledStart) notFound();

  const schedule: LiveSchedule = { scheduledStart: lesson.scheduledStart, scheduledEnd: lesson.scheduledEnd };
  const state = resolveLiveClassState(schedule, liveClass, new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <AttendanceTracker liveClassId={liveClass.id} />

      <div>
        <h1 className="font-display text-lg font-bold text-foreground">{lesson.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{lesson.group.chapter.module.course.title}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Link2 className="h-3 w-3" /> {formatDhakaDateTimeBST(schedule.scheduledStart)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <LiveRoomVideo
          state={state}
          youtubeVideoId={lesson.youtubeVideoId}
          title={lesson.title}
          scheduledStart={schedule.scheduledStart}
        />
        <div className="h-[420px] lg:h-auto">
          <LiveChatPanel liveClassId={liveClass.id} state={state} />
        </div>
      </div>
    </div>
  );
}
