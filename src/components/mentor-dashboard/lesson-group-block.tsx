import { ChevronUp, ChevronDown } from "lucide-react";
import { LessonRow } from "@/components/mentor-dashboard/lesson-row";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createLesson,
  deleteLessonGroup,
  reorderLessonGroup,
} from "@/server/actions/mission-actions";

type GroupWithLessons = {
  id: string;
  title: string;
  lessons: {
    id: string;
    title: string;
    description: string | null;
    youtubeVideoId: string | null;
    durationSeconds: number;
    isPreview: boolean;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    resources: { id: string; title: string; url: string }[];
  }[];
};

export function LessonGroupBlock({
  courseId,
  chapterId,
  group,
  isFirst,
  isLast,
}: {
  courseId: string;
  chapterId: string;
  group: GroupWithLessons;
  isFirst: boolean;
  isLast: boolean;
}) {
  const boundCreateLesson = createLesson.bind(null, courseId);
  const boundDeleteGroup = deleteLessonGroup.bind(null, courseId, group.id);
  const boundReorderUp = reorderLessonGroup.bind(null, courseId, chapterId, group.id, "up");
  const boundReorderDown = reorderLessonGroup.bind(null, courseId, chapterId, group.id, "down");

  return (
    <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{group.title}</p>
        <div className="flex items-center gap-1.5">
          <form action={boundReorderUp}>
            <button
              type="submit"
              disabled={isFirst}
              className="rounded-lg border border-border/60 p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move class type up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
          </form>
          <form action={boundReorderDown}>
            <button
              type="submit"
              disabled={isLast}
              className="rounded-lg border border-border/60 p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move class type down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </form>
          <ConfirmDeleteButton
            action={boundDeleteGroup}
            confirmMessage={`Delete "${group.title}" and all its patrols?`}
          />
        </div>
      </div>

      <div className="space-y-2">
        {group.lessons.map((lesson) => (
          <LessonRow key={lesson.id} courseId={courseId} groupId={group.id} lesson={lesson} />
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:text-accent/80">
          + Add patrol (lesson)
        </summary>
        <form
          action={boundCreateLesson}
          className="mt-2 space-y-2 rounded-xl border border-border/60 bg-surface/60 p-3"
        >
          <input type="hidden" name="groupId" value={group.id} />
          <input
            name="title"
            required
            placeholder="Lesson title"
            className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
          />
          <input
            name="youtubeUrl"
            required
            placeholder="Paste a YouTube URL"
            className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
          />
          <div className="flex gap-2">
            <input
              name="durationSeconds"
              type="number"
              min={0}
              placeholder="Duration (sec)"
              className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
            />
            <label className="flex shrink-0 items-center gap-2 text-xs text-foreground">
              <input type="checkbox" name="isPreview" /> Free preview
            </label>
          </div>
          <details>
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
              Live class? (optional)
            </summary>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Set a start time to make this a live class instead of a recorded lesson — put it in
              a "Live" class type so it sits alongside your recorded ones. Leave blank for an
              ordinary recorded patrol. Times are Bangladesh time (UTC+6).
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                name="scheduledStart"
                className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-xs"
              />
              <input
                type="datetime-local"
                name="scheduledEnd"
                placeholder="End (optional)"
                className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-xs"
              />
            </div>
          </details>
          <SubmitButton
            pendingLabel="Adding patrol…"
            className="h-9 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add patrol
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
