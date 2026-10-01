import { LessonGroupBlock } from "@/components/mentor-dashboard/lesson-group-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
import { AddAction } from "@/components/mentor-dashboard/add-action";
import { OverflowMenu } from "@/components/mentor-dashboard/overflow-menu";
import { MENU_ITEM_CLASS } from "@/components/mentor-dashboard/builder-menu-items";
import { deleteChapter } from "@/server/actions/mission-actions";

/** One-tap class type names; ones the chapter already has are hidden. */
const GROUP_SUGGESTIONS = ["Foundation Class", "Practice Class", "Live Class", "Archive Class"];

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
      thumbnailUrl: string | null;
      durationSeconds: number;
      isPreview: boolean;
      scheduledStart: Date | null;
      scheduledEnd: Date | null;
      resources: { id: string; title: string; url: string; type: string; downloadable: boolean; downloadCount: number }[];
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
  const boundDeleteChapter = deleteChapter.bind(null, courseId, chapter.id);

  const patrolCount = chapter.groups.reduce((n, g) => n + g.lessons.length, 0);
  const have = new Set(chapter.groups.map((g) => g.title.toLowerCase()));
  const suggestions = GROUP_SUGGESTIONS.filter((name) => !have.has(name.toLowerCase()));

  const addClassType = (
    <QuickAdd
      courseId={courseId}
      kind="groups"
      parentId={chapter.id}
      placeholder="Class type, e.g. Foundation Class"
      bulkPlaceholder={"Foundation Class\nPractice Class"}
      suggestions={suggestions}
      hint="One class type per line."
    />
  );

  return (
    <CollapsibleSection
      title={chapter.title}
      meta={`${chapter.groups.length} class type${chapter.groups.length === 1 ? "" : "s"} · ${patrolCount} patrol${patrolCount === 1 ? "" : "s"}`}
      titleClassName="text-sm font-semibold text-foreground"
      defaultOpen={false}
      actions={
        <OverflowMenu label={`More actions for ${chapter.title}`}>
          <ConfirmDeleteButton
            action={boundDeleteChapter}
            confirmMessage={`Delete chapter "${chapter.title}" and everything inside it?`}
            label="Delete chapter"
            className={`${MENU_ITEM_CLASS} text-danger hover:text-danger`}
          />
        </OverflowMenu>
      }
    >
      {chapter.groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center">
          <p className="mb-3 text-xs text-muted-foreground">
            No class types yet. A class type (like Foundation Class) groups patrols inside this chapter.
          </p>
          <AddAction label="Add class type" primary className="text-left">
            {addClassType}
          </AddAction>
        </div>
      ) : (
        <>
          <div className="ml-3 space-y-1 border-l-2 border-border/40 pl-2 sm:ml-4 sm:pl-3">
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
          <AddAction label="Add class type" className="ml-3 mt-1 sm:ml-4">
            {addClassType}
          </AddAction>
        </>
      )}
    </CollapsibleSection>
  );
}
