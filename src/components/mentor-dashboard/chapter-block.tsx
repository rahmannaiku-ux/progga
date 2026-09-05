import { LessonGroupBlock } from "@/components/mentor-dashboard/lesson-group-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { SubmitButton } from "@/components/shared/submit-button";
import { createLessonGroup, deleteChapter } from "@/server/actions/mission-actions";

type ChapterWithGroups = {
  id: string;
  title: string;
  groups: {
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
  }[];
};

export function ChapterBlock({
  courseId,
  chapter,
}: {
  courseId: string;
  chapter: ChapterWithGroups;
}) {
  const boundCreateGroup = createLessonGroup.bind(null, courseId);
  const boundDeleteChapter = deleteChapter.bind(null, courseId, chapter.id);

  return (
    <div className="rounded-xl border border-border/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {chapter.title}
        </p>
        <ConfirmDeleteButton
          action={boundDeleteChapter}
          confirmMessage={`Delete chapter "${chapter.title}" and everything inside it?`}
        />
      </div>

      <div className="space-y-2">
        {chapter.groups.map((group, i) => (
          <LessonGroupBlock
            key={group.id}
            courseId={courseId}
            chapterId={chapter.id}
            group={group}
            isFirst={i === 0}
            isLast={i === chapter.groups.length - 1}
          />
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:text-accent/80">
          + Add class type (e.g. "Foundation Class", "Archive Class")
        </summary>
        <form
          action={boundCreateGroup}
          className="mt-2 flex gap-2 rounded-xl border border-border/60 bg-surface/60 p-3"
        >
          <input type="hidden" name="chapterId" value={chapter.id} />
          <input
            name="title"
            required
            placeholder="Class type title"
            className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
          />
          <SubmitButton
            pendingLabel="Adding…"
            className="h-9 shrink-0 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            Add
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
