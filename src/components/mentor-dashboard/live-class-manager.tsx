"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2, Pencil, Trash2, Video } from "lucide-react";
import {
  addLiveClassAsLesson,
  createLiveClass,
  deleteLiveClass,
  updateLiveClass,
  type LiveScheduleResult,
} from "@/server/actions/live-schedule-actions";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm";

function useRunner() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(task: () => Promise<LiveScheduleResult>, onOk?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await task();
        setMessage({ ok: res.ok, text: res.ok ? res.message : res.error });
        if (res.ok) onOk?.();
      } catch {
        setMessage({ ok: false, text: "Something went wrong. Please try again." });
      }
    });
  }
  return { pending, message, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      role={message.ok ? "status" : "alert"}
      className={cn("text-xs font-semibold", message.ok ? "text-accent" : "text-danger")}
    >
      {message.text}
    </p>
  );
}

export type MissionOption = { id: string; title: string };

/** "Schedule a live class": pick the mission to stream it on, then the details. */
export function LiveClassCreateForm({ courses, defaultOpen }: { courses: MissionOption[]; defaultOpen: boolean }) {
  const { pending, message, run } = useRunner();
  const [formKey, setFormKey] = useState(0);

  if (courses.length === 0) {
    return (
      <p className="comic-panel bg-surface p-5 text-sm text-muted-foreground">
        You don't teach any mission yet. Create a mission first, then you can schedule live classes for it.
      </p>
    );
  }

  return (
    <details open={defaultOpen} className="comic-panel bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-sm font-bold text-foreground">
        <CalendarPlus className="h-4 w-4 text-primary" /> Schedule a live class
      </summary>
      <form
        key={formKey}
        action={(formData) => run(() => createLiveClass(formData), () => setFormKey((k) => k + 1))}
        className="mt-4 space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Stream it on which mission?</label>
          <select name="courseId" required defaultValue={courses.length === 1 ? courses[0]!.id : ""} className={inputClass}>
            <option value="" disabled>
              Choose a mission…
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Only students of that mission can join. It won't appear among the mission's chapters.
          </p>
        </div>
        <input name="title" required minLength={3} maxLength={120} placeholder="Title, e.g. Vector: live Q&A" className={inputClass} />
        <input name="youtubeUrl" placeholder="YouTube live link (you can add it later)" className={inputClass} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Starts (Bangladesh time)</label>
            <input type="datetime-local" name="scheduledStart" required className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Ends (optional)</label>
            <input type="datetime-local" name="scheduledEnd" className={inputClass} />
          </div>
        </div>
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          placeholder="What will you cover? (optional)"
          className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground md:text-sm"
        />
        <Message message={message} />
        <button
          type="submit"
          disabled={pending}
          className="comic-btn inline-flex items-center gap-1.5 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {pending ? "Scheduling…" : "Schedule live class"}
        </button>
      </form>
    </details>
  );
}

export type ChapterOption = { id: string; label: string };

export type LiveClassControlsProps = {
  lessonId: string;
  title: string;
  description: string | null;
  youtubeUrl: string;
  /** datetime-local values in Bangladesh time. */
  startValue: string;
  endValue: string;
  status: "UPCOMING" | "LIVE" | "ENDED";
  addedAsLesson: boolean;
  chapterOptions: ChapterOption[];
};

type Panel = "edit" | "add" | null;

/** Edit / delete a live class, and add an ended one to a chapter as a lesson. */
export function LiveClassControls(props: LiveClassControlsProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const { pending, message, run } = useRunner();
  const canEditTime = props.status === "UPCOMING";
  const canAdd = props.status === "ENDED";

  function toggle(next: Exclude<Panel, null>) {
    setPanel((p) => (p === next ? null : next));
  }

  function handleDelete() {
    if (!confirm(`Delete the live class "${props.title}"? This can't be undone.`)) return;
    run(() => deleteLiveClass(props.lessonId));
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50";

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => toggle("edit")} className={btn}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {canAdd &&
          (props.addedAsLesson ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Check className="h-3.5 w-3.5" /> Added to a chapter
            </span>
          ) : (
            <button type="button" onClick={() => toggle("add")} className={btn}>
              <Video className="h-3.5 w-3.5" /> Add to a chapter
            </button>
          ))}
        {props.status !== "LIVE" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>

      {panel === "edit" && (
        <form action={(formData) => run(() => updateLiveClass(props.lessonId, formData))} className="mt-3 space-y-2">
          <input name="title" defaultValue={props.title} required minLength={3} maxLength={120} className={inputClass} />
          <input name="youtubeUrl" defaultValue={props.youtubeUrl} placeholder="YouTube live link" className={inputClass} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="datetime-local"
              name="scheduledStart"
              defaultValue={props.startValue}
              required
              disabled={!canEditTime}
              className={inputClass}
            />
            <input
              type="datetime-local"
              name="scheduledEnd"
              defaultValue={props.endValue}
              disabled={!canEditTime}
              className={inputClass}
            />
          </div>
          {!canEditTime && (
            <>
              {/* Disabled inputs aren't submitted, but the action needs a start. It ignores it once a class has started. */}
              <input type="hidden" name="scheduledStart" value={props.startValue} />
              <p className="text-[11px] text-muted-foreground">The time can't change once a class has started.</p>
            </>
          )}
          <textarea
            name="description"
            defaultValue={props.description ?? ""}
            rows={2}
            maxLength={2000}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground md:text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="comic-btn bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}

      {panel === "add" && (
        <form
          action={(formData) => run(() => addLiveClassAsLesson(props.lessonId, formData), () => setPanel(null))}
          className="mt-3 space-y-2"
        >
          <p className="text-xs text-muted-foreground">
            This adds the recording to the mission as a normal lesson. The live class stays in the live room.
          </p>
          {props.chapterOptions.length === 0 ? (
            <p className="text-xs font-semibold text-danger">
              This mission has no chapters yet. Add an operation, chapter and class type in its builder first.
            </p>
          ) : (
            <>
              <select name="groupId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Choose where it goes…
                </option>
                {props.chapterOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                name="youtubeUrl"
                defaultValue={props.youtubeUrl}
                placeholder="Recording's YouTube link"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={pending}
                className="comic-btn bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {pending ? "Adding…" : "Add to chapter"}
              </button>
            </>
          )}
        </form>
      )}

      <div className="mt-2">
        <Message message={message} />
      </div>
    </div>
  );
}
