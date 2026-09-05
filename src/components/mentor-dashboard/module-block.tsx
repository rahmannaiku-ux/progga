import { ChevronUp, ChevronDown } from "lucide-react";
import { ChapterBlock } from "@/components/mentor-dashboard/chapter-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  createChapter,
  deleteModule,
  reorderModule,
} from "@/server/actions/mission-actions";

type ModuleWithChapters = {
  id: string;
  title: string;
  summary: string | null;
  chapters: {
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
  }[];
};

export function ModuleBlock({
  courseId,
  module,
  isFirst,
  isLast,
}: {
  courseId: string;
  module: ModuleWithChapters;
  isFirst: boolean;
  isLast: boolean;
}) {
  const boundCreateChapter = createChapter.bind(null, courseId);
  const boundDeleteModule = deleteModule.bind(null, courseId, module.id);
  const boundReorderUp = reorderModule.bind(null, courseId, module.id, "up");
  const boundReorderDown = reorderModule.bind(null, courseId, module.id, "down");

  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            {module.title}
          </h3>
          {module.summary && (
            <p className="mt-1 text-xs text-muted-foreground">{module.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <form action={boundReorderUp}>
            <button
              type="submit"
              disabled={isFirst}
              className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move operation up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </form>
          <form action={boundReorderDown}>
            <button
              type="submit"
              disabled={isLast}
              className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move operation down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </form>
          <ConfirmDeleteButton
            action={boundDeleteModule}
            confirmMessage={`Delete operation "${module.title}" and everything inside it?`}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {module.chapters.map((chapter) => (
          <ChapterBlock key={chapter.id} courseId={courseId} chapter={chapter} />
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:text-accent/80">
          + Add chapter
        </summary>
        <form
          action={boundCreateChapter}
          className="mt-2 flex gap-2 rounded-xl border border-border/60 bg-surface/60 p-3"
        >
          <input type="hidden" name="moduleId" value={module.id} />
          <input
            name="title"
            required
            placeholder="Chapter title"
            className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
          />
          <SubmitButton
            pendingLabel="Adding…"
            className="h-9 shrink-0 comic-btn bg-primary px-4 text-xs font-bold text-primary-foreground"
          >
            Add
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
