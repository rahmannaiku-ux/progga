import { ChevronUp, ChevronDown } from "lucide-react";
import { LessonRow } from "@/components/mentor-dashboard/lesson-row";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { SubmitButton } from "@/components/shared/submit-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
import { ImageUploadField } from "@/components/mentor-dashboard/image-upload-field";
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
    thumbnailUrl: string | null;
    durationSeconds: number;
    isPreview: boolean;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    resources: { id: string; title: string; url: string; type: string; downloadable: boolean; downloadCount: number }[];
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
      <CollapsibleSection
        title={group.title}
        meta={`${group.lessons.length} patrol${group.lessons.length === 1 ? "" : "s"}`}
        titleClassName="text-sm font-semibold text-foreground"
        actions={
          <>
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
          </>
        }
      >
        <div className="space-y-2">
          {group.lessons.map((lesson) => (
            <LessonRow key={lesson.id} courseId={courseId} groupId={group.id} lesson={lesson} />
          ))}
        </div>

        <QuickAdd
          className="mt-3"
          courseId={courseId}
          kind="lessons"
          parentId={group.id}
          placeholder="Title | YouTube link"
          hint="One patrol per line, so you can paste a whole list. Add each thumbnail afterwards with Edit."
        />

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:text-accent/80">
          Add one patrol with more options (duration, free preview, live class)
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
          <ImageUploadField
            name="thumbnailUrl"
            context="LESSON_THUMBNAIL"
            label="Thumbnail picture (optional)"
            maxSide={1280}
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
          <SubmitButton
            pendingLabel="Adding patrol…"
            className="h-9 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add patrol
          </SubmitButton>
        </form>
      </details>
      </CollapsibleSection>
    </div>
  );
}
