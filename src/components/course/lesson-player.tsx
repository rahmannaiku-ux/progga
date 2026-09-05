"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { updateLessonProgress } from "@/server/actions/learning-actions";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/course/video-player";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { celebratePop } from "@/lib/motion";

const AUTOSAVE_INTERVAL_MS = 15_000;

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
  // The actual YT.Player instance now lives inside <VideoPlayer>, not
  // here — this component no longer talks to the YouTube API directly.
  // It only needs to know the latest known playback position, which
  // VideoPlayer reports via onProgressTick (polled while playing, and
  // on every pause). lastKnownTimeRef is a ref, not state, because we
  // don't want a re-render on every 250ms tick — only persist() ever
  // reads it, at save time.
  const lastKnownTimeRef = useRef(resumeAtSeconds);
  const [completed, setCompleted] = useState(isCompleted);
  const [saving, setSaving] = useState(false);
  // Only true for the transition false->true within THIS session — a
  // lesson that was already complete on page load shouldn't celebrate
  // again every time you revisit it.
  const [justCompleted, setJustCompleted] = useState(false);

  async function persist(markComplete: boolean) {
    const current = Math.floor(lastKnownTimeRef.current);
    setSaving(true);
    try {
      await updateLessonProgress(lessonId, current, current, markComplete);
      if (markComplete && !completed) {
        setCompleted(true);
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 3200);
      } else if (markComplete) {
        setCompleted(true);
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (!completed) persist(false);
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  // Save once more on unmount/navigation away so a quick lesson switch
  // doesn't lose up to 15s of progress.
  useEffect(() => {
    return () => {
      if (!completed) persist(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <VideoPlayer
        youtubeVideoId={youtubeVideoId}
        resumeAtSeconds={resumeAtSeconds}
        onProgressTick={(seconds) => {
          lastKnownTimeRef.current = seconds;
        }}
        onEnded={(finalSeconds) => {
          // Only a genuine YouTube "ended" event reaches here — never a
          // seek to the end. The server independently re-verifies a
          // real watch threshold before honoring markComplete=true
          // regardless (see updateLessonProgress), so this is
          // defense-in-depth, not the only guard.
          lastKnownTimeRef.current = finalSeconds;
          persist(true);
        }}
      />

      <AnimatePresence>
        {justCompleted && (
          <motion.div
            variants={celebratePop}
            initial="initial"
            animate="animate"
            exit="exit"
            className="comic-panel mt-3 flex items-center gap-3 border-accent/60 bg-accent/10 p-3"
          >
            <ProggyMascot state="celebrating" className="h-10 w-10 shrink-0" animated={false} />
            <p className="font-display text-sm font-bold text-foreground">
              Patrol complete! Nice work, hero. 🎉
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="comic-panel mt-3 flex flex-col gap-3 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {saving ? "Saving progress..." : "Progress saves automatically"}
        </p>
        <Button
          type="button"
          size="md"
          variant={completed ? "outline" : "accent"}
          disabled={completed || saving}
          onClick={() => persist(true)}
          className="w-full sm:w-auto"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {completed ? "Patrol complete" : "Mark as complete"}
        </Button>
      </div>
    </div>
  );
}
