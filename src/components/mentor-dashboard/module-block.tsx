import { ChevronUp, ChevronDown } from "lucide-react";
import { ChapterBlock } from "@/components/mentor-dashboard/chapter-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
import { deleteModule, reorderModule } from "@/server/actions/mission-actions";

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
        thumbnailUrl: string | null;
        durationSeconds: number;
        isPreview: boolean;
        scheduledStart: Date | null;
        scheduledEnd: Date | null;
        resources: { id: string; title: string; url: string; type: string; downloadable: boolean; downloadCount: number }[];
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
  const boundDeleteModule = deleteModule.bind(null, courseId, module.id);
  const boundReorderUp = reorderModule.bind(null, courseId, module.id, "up");
  const boundReorderDown = reorderModule.bind(null, courseId, module.id, "down");

  const patrolCount = module.chapters.reduce(
    (n, c) => n + c.groups.reduce((m, g) => m + g.lessons.length, 0),
    0
  );
  const meta = `${module.chapters.length} chapter${module.chapters.length === 1 ? "" : "s"} · ${patrolCount} patrol${patrolCount === 1 ? "" : "s"}`;

  return (
    <div className="glass-panel p-4 sm:p-5">
      <CollapsibleSection
        title={module.title}
        meta={meta}
        defaultOpen={isFirst}
        titleClassName="font-display text-base font-semibold text-foreground"
        actions={
          <>
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
          </>
        }
      >
        {module.summary && <p className="mb-3 text-xs text-muted-foreground">{module.summary}</p>}

        <div className="space-y-3">
          {module.chapters.map((chapter) => (
            <ChapterBlock key={chapter.id} courseId={courseId} chapter={chapter} />
          ))}
        </div>

        <QuickAdd
          className="mt-3"
          courseId={courseId}
          kind="chapters"
          parentId={module.id}
          placeholder="Add chapter, e.g. Vector"
          hint="Press Enter to add. Paste a list (one chapter per line) to add many at once."
        />
      </CollapsibleSection>
    </div>
  );
}
