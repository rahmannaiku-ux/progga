"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Play, Square, Ban, Megaphone, MessageSquareOff, MessageSquare } from "lucide-react";
import {
  startLiveClass,
  endLiveClass,
  cancelLiveClass,
  setChatEnabled,
  setLiveClassAnnouncement,
  removeLiveClassAnnouncement,
} from "@/server/actions/live-class-actions";
import type { LiveClassState } from "@/lib/live/state";

/**
 * Teacher lifecycle + chat-level controls for /live/manage/[id]. Every
 * button here calls a server action that re-authorizes and re-checks
 * the state machine itself (see live-class-actions.ts) -- this
 * component's only job is calling them and reflecting the result;
 * hiding/disabling a button is a UX nicety, never the actual guard.
 */
export function TeacherLiveControls({
  liveClassId,
  state,
  chatEnabled,
  canStart,
}: {
  liveClassId: string;
  state: LiveClassState;
  chatEnabled: boolean;
  canStart: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="comic-panel space-y-3 bg-surface p-4">
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {state === "SCHEDULED" && (
          <>
            <button
              type="button"
              disabled={pending || !canStart}
              onClick={() => run(() => startLiveClass(liveClassId))}
              title={!canStart ? "You can start up to 30 minutes before the scheduled time." : undefined}
              className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Start class
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Cancel this live class? Students will no longer see it.")) run(() => cancelLiveClass(liveClassId));
              }}
              className="comic-btn flex items-center gap-1.5 border border-border/60 px-4 py-2 text-sm font-bold text-foreground disabled:opacity-50"
            >
              <Ban className="h-4 w-4" /> Cancel
            </button>
          </>
        )}

        {state === "LIVE" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("End this live class now?")) run(() => endLiveClass(liveClassId));
            }}
            className="comic-btn flex items-center gap-1.5 bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Square className="h-4 w-4 fill-current" /> End class
          </button>
        )}

        {(state === "ENDED" || state === "CANCELLED") && (
          <span className="text-sm text-muted-foreground">
            {state === "ENDED" ? "This class has ended." : "This class was cancelled."}
          </span>
        )}
      </div>

      {state === "LIVE" && (
        <>
          <div className="flex items-center gap-2 border-t border-border/60 pt-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setChatEnabled(liveClassId, !chatEnabled))}
              className="comic-btn flex items-center gap-1.5 border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-50"
            >
              {chatEnabled ? <MessageSquareOff className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
              {chatEnabled ? "Disable chat" : "Enable chat"}
            </button>
          </div>

          <form
            className="flex items-center gap-2 border-t border-border/60 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => setLiveClassAnnouncement(liveClassId, announcementDraft));
            }}
          >
            <Megaphone className="h-4 w-4 shrink-0 text-xp" />
            <input
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
              maxLength={300}
              placeholder="Post an announcement..."
              className="h-9 flex-1 rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground"
            />
            <button
              type="submit"
              disabled={pending || !announcementDraft.trim()}
              className="comic-btn bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              Post
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeLiveClassAnnouncement(liveClassId))}
              className="comic-btn border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-50"
            >
              Clear
            </button>
          </form>
        </>
      )}
    </div>
  );
}
