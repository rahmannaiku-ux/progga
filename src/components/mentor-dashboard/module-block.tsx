import { ChapterBlock } from "@/components/mentor-dashboard/chapter-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
import { AddAction } from "@/components/mentor-dashboard/add-action";
import { OverflowMenu } from "@/components/mentor-dashboard/overflow-menu";
import { MENU_ITEM_CLASS, ReorderMenuItems } from "@/components/mentor-dashboard/builder-menu-items";
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

  const addChapter = (
    <QuickAdd
      courseId={courseId}
      kind="chapters"
      parentId={module.id}
      placeholder="Chapter, e.g. Vector"
      bulkPlaceholder={"Vector\nNewtonian Mechanics"}
      hint="One chapter per line."
    />
  );

  return (
    <div className="glass-panel p-2 sm:p-3">
      <CollapsibleSection
        title={module.title}
        meta={meta}
        defaultOpen={isFirst}
        titleClassName="font-display text-base font-semibold text-foreground"
        actions={
          <OverflowMenu label={`More actions for ${module.title}`}>
            <ReorderMenuItems
              up={boundReorderUp}
              down={boundReorderDown}
              isFirst={isFirst}
              isLast={isLast}
              noun="operation"
            />
            <ConfirmDeleteButton
              action={boundDeleteModule}
              confirmMessage={`Delete operation "${module.title}" and everything inside it?`}
              label="Delete operation"
              className={`${MENU_ITEM_CLASS} text-danger hover:text-danger`}
            />
          </OverflowMenu>
        }
      >
        {module.summary && <p className="mb-2 px-2 text-xs text-muted-foreground">{module.summary}</p>}

        {module.chapters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center">
            <p className="mb-3 text-xs text-muted-foreground">No chapters in this operation yet.</p>
            <AddAction label="Add chapter" primary className="text-left">
              {addChapter}
            </AddAction>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/30">
              {module.chapters.map((chapter) => (
                <div key={chapter.id} className="py-1 first:pt-0">
                  <ChapterBlock courseId={courseId} chapter={chapter} />
                </div>
              ))}
            </div>
            <AddAction label="Add chapter" className="mt-1">
              {addChapter}
            </AddAction>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}
