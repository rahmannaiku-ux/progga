import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireLiveRoomEnabledOrNotFound } from "@/lib/live/flag";
import { assertCanManageLiveClass } from "@/server/live/live-access";
import { db } from "@/lib/db/client";
import { resolveLiveClassState, earliestManualStartAt, type LiveSchedule } from "@/lib/live/state";
import { LiveRoomVideo } from "@/components/live/live-room-video";
import { LiveChatPanel } from "@/components/live/live-chat-panel";
import { TeacherLiveControls } from "@/components/live/teacher-live-controls";
import { STREAM_LIVECLASS_CHANNEL_CONFIG } from "@/server/live/chat/service";
import { pinLiveClassMessage, unpinLiveClassMessage, deleteLiveClassMessage } from "@/server/actions/live-class-actions";
import { formatDhakaDateTimeBST } from "@/lib/timezone";

export default async function ManageLiveClassPage({ params }: { params: { liveClassId: string } }) {
  const user = await getCurrentUser();
  await requireLiveRoomEnabledOrNotFound(user);

  const access = await assertCanManageLiveClass(params.liveClassId, user);
  if (!access.ok) {
    if (access.reason === "NOT_FOUND") notFound();
    return (
      <div className="comic-panel mx-auto mt-12 max-w-md bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">You don't have access to manage this live class.</p>
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
  const now = new Date();
  const state = resolveLiveClassState(schedule, liveClass, now);
  const canStart = now.getTime() >= earliestManualStartAt(schedule).getTime();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="font-display text-lg font-bold text-foreground">{lesson.title}</h1>
        <p className="text-xs text-muted-foreground">
          {lesson.group.chapter.module.course.title} ·{" "}
          <span suppressHydrationWarning>{formatDhakaDateTimeBST(schedule.scheduledStart)}</span>
        </p>
      </div>

      <TeacherLiveControls
        liveClassId={liveClass.id}
        state={state}
        chatEnabled={liveClass.chatEnabled}
        canStart={canStart}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <LiveRoomVideo
          state={state}
          youtubeVideoId={lesson.youtubeVideoId}
          title={lesson.title}
          scheduledStart={schedule.scheduledStart}
        />
        <div className="h-[420px] lg:h-auto">
          <LiveChatPanel
            liveClassId={liveClass.id}
            state={state}
            moderation={{
              pinMessage: pinLiveClassMessage.bind(null, liveClass.id),
              unpinMessage: unpinLiveClassMessage.bind(null, liveClass.id),
              deleteMessage: deleteLiveClassMessage.bind(null, liveClass.id),
              maxPinned: STREAM_LIVECLASS_CHANNEL_CONFIG.maxPinnedMessages,
            }}
          />
        </div>
      </div>
    </div>
  );
}
