"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Ban, Video as VideoIcon, Clock } from "lucide-react";
import { LiveClassPlayer } from "@/components/course/live-class-player";
import { formatDuration } from "@/lib/live-classes";
import { formatDhakaDateTimeBST } from "@/lib/timezone";
import type { LiveClassState } from "@/lib/live/state";

/**
 * Thin wrapper around LiveClassPlayer that adds the states a Live Room
 * needs around it -- missing/invalid video, upcoming (countdown),
 * ended, cancelled -- and reports room presence for attendance.
 * Preserves LiveClassPlayer's DevTools shield and click-to-join
 * behavior; Phase 6 only added the shared `.protected-content`
 * deterrence class and non-draggable poster images to both this
 * component and LiveClassPlayer itself -- no watermark exists or is
 * added anywhere in this file or LiveClassPlayer.
 *
 * "Attendance" fires on MOUNT (being in the room), not on clicking Join
 * inside the player -- matching the architecture plan's "presence in
 * the room, not video click" definition. `onRoomMounted`/`onRoomLeft`
 * are called once each; the parent (the room page) owns the actual
 * fetch to /api/live/[id]/attendance, including making the "leave" call
 * a sendBeacon-friendly on page hide.
 */
export function LiveRoomVideo({
  state,
  youtubeVideoId,
  title,
  scheduledStart,
  posterUrl,
  onRoomMounted,
}: {
  state: LiveClassState;
  youtubeVideoId: string | null;
  title: string;
  scheduledStart: Date;
  posterUrl?: string | null;
  onRoomMounted?: () => void;
}) {
  const mountedOnce = useRef(false);
  useEffect(() => {
    if (mountedOnce.current) return; // guards React StrictMode's dev-only double effect
    mountedOnce.current = true;
    onRoomMounted?.();
    // No cleanup-based "leave" here on purpose -- the room PAGE owns
    // leave (including the sendBeacon-on-unload path), so it isn't
    // silently skipped if this component unmounts for a reason that
    // doesn't fire beforeunload (e.g. client-side navigation away).
  }, [onRoomMounted]);

  if (state === "CANCELLED") {
    return (
      <EmptyPanel icon={<Ban className="h-8 w-8 text-danger" />} message="This class was cancelled." />
    );
  }

  if (state === "SCHEDULED") {
    return <UpcomingPanel title={title} scheduledStart={scheduledStart} posterUrl={posterUrl} />;
  }

  if (state === "ENDED") {
    return (
      <EmptyPanel
        icon={<Clock className="h-8 w-8 text-muted-foreground" />}
        message="This class has ended."
      />
    );
  }

  // state === "LIVE"
  if (!youtubeVideoId) {
    return (
      <EmptyPanel
        icon={<VideoIcon className="h-8 w-8 text-muted-foreground" />}
        message="The teacher hasn't set up the stream yet. Check back shortly."
      />
    );
  }

  return <LiveClassPlayer youtubeVideoId={youtubeVideoId} title={title} posterUrl={posterUrl} />;
}

function EmptyPanel({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="comic-panel flex aspect-video flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
      {icon}
      <p className="font-display text-sm font-bold text-foreground">{message}</p>
    </div>
  );
}

function UpcomingPanel({
  title,
  scheduledStart,
  posterUrl,
}: {
  title: string;
  scheduledStart: Date;
  posterUrl?: string | null;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="protected-content relative aspect-video overflow-hidden rounded-2xl bg-black">
      {posterUrl && (
        <Image src={posterUrl} alt="" fill draggable={false} className="object-cover opacity-40" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-4 text-center text-white">
        <p className="font-display text-base font-bold">{title}</p>
        <p className="text-xs text-white/70" suppressHydrationWarning>
          {formatDhakaDateTimeBST(scheduledStart)}
        </p>
        <p className="mt-1 font-mono text-lg font-bold text-xp" suppressHydrationWarning>
          {scheduledStart.getTime() <= now.getTime()
            ? "Starting..."
            : `Starts in ${formatDuration(scheduledStart.getTime() - now.getTime())}`}
        </p>
      </div>
    </div>
  );
}
