"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updateLessonProgress } from "@/server/actions/learning-actions";
import { VideoPlayer } from "@/components/course/video-player";
import { playedSecondsBetweenTicks, type PlaybackTick } from "@/lib/lesson-progress";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";

const AUTOSAVE_INTERVAL_MS = 15_000;

/**
 * Plays a recorded lesson and reports progress. Completion is detected
 * automatically: the player measures how much video was actually PLAYED
 * (consecutive playback ticks — dragging the slider or skipping ahead adds
 * nothing) and the server marks the lesson complete once enough was played
 * and the student reached the end. There is no "mark as complete" control:
 * students can't choose to complete a lesson, and can't complete one by
 * seeking to the end.
 */
export function LessonPlayer({
  lessonId,
  youtubeVideoId,
  resumeAtSeconds,
  isCompleted,
}: {
  lessonId: string;
  youtubeVideoId: string;
  resumeAtSeconds: number;
  isCompleted: boolean;
}) {
  // Refs, not state: they change up to 4x/second and only save time reads them.
  const positionRef = useRef(resumeAtSeconds);
  const durationRef = useRef(0);
  const pendingPlayedRef = useRef(0); // seconds actually played since the last successful save
  const lastTickRef = useRef<PlaybackTick | null>(null);
  const savingRef = useRef(false);
  const completedRef = useRef(isCompleted);

  const [completed, setCompleted] = useState(isCompleted);
  const [saving, setSaving] = useState(false);
  // Only true for the false->true transition within THIS session — a lesson
  // that was already complete on page load shouldn't celebrate on every visit.
  const [justCompleted, setJustCompleted] = useState(false);

  async function persist(retryIfBusy = false) {
    if (completedRef.current) return;
    if (savingRef.current) {
      // e.g. the video just ended while an autosave was in flight
      if (retryIfBusy) setTimeout(() => void persist(), 1200);
      return;
    }
    const played = Math.floor(pendingPlayedRef.current);
    pendingPlayedRef.current -= played; // keep the fractional remainder
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await updateLessonProgress(
        lessonId,
        played,
        Math.floor(positionRef.current),
        false,
        durationRef.current > 0 ? Math.round(durationRef.current) : undefined
      );
      if (result?.completed && !completedRef.current) {
        completedRef.current = true;
        setCompleted(true);
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 3200);
      }
    } catch {
      pendingPlayedRef.current += played; // try again with the next save
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Playback ticks arrive ~4x/second while playing. Only plausible playback
  // counts as "watched" (see playedSecondsBetweenTicks) — a seek adds nothing.
  function handleTick(seconds: number, videoDuration?: number) {
    const now = Date.now();
    positionRef.current = seconds;
    if (videoDuration && videoDuration > 0) durationRef.current = videoDuration;
    pendingPlayedRef.current += playedSecondsBetweenTicks(lastTickRef.current, seconds, now);
    lastTickRef.current = { position: seconds, at: now };
  }

  useEffect(() => {
    const interval = setInterval(() => void persist(), AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save once more on unmount/navigation away so a quick lesson switch
  // doesn't lose up to 15s of progress.
  useEffect(() => {
    return () => {
      void persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <VideoPlayer
        youtubeVideoId={youtubeVideoId}
        resumeAtSeconds={resumeAtSeconds}
        onProgressTick={handleTick}
        // Play/pause and every seek re-enter PLAYING: forget the previous tick
        // so the next one starts a fresh measurement instead of counting the jump.
        onPlayingChange={() => {
          lastTickRef.current = null;
        }}
        onEnded={(finalSeconds) => {
          positionRef.current = finalSeconds;
          void persist(true); // let the server decide whether it counts
        }}
      />

      {justCompleted && (
        <div className="pop-in comic-panel mt-3 flex items-center gap-3 border-accent/60 bg-accent/10 p-3">
          <ProggyMascot state="celebrating" className="h-10 w-10 shrink-0" animated={false} />
          <p className="font-display text-sm font-bold text-foreground">
            Patrol complete! Nice work, hero. 🎉
          </p>
        </div>
      )}

      <p
        role="status"
        className="mt-3 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : completed ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
        ) : null}
        {saving
          ? "Saving progress..."
          : completed
            ? "Patrol complete — tracked automatically"
            : "Progress is tracked automatically as you watch"}
      </p>
    </div>
  );
}
