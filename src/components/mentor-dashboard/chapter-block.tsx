import { LessonGroupBlock } from "@/components/mentor-dashboard/lesson-group-block";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { QuickAdd } from "@/components/mentor-dashboard/quick-add";
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

  return (
    <div className="rounded-xl border border-border/40 p-3">
      <CollapsibleSection
        title={chapter.title}
        meta={`${patrolCount} patrol${patrolCount === 1 ? "" : "s"}`}
        titleClassName="text-sm font-semibold text-foreground"
        actions={
          <ConfirmDeleteButton
            action={boundDeleteChapter}
            confirmMessage={`Delete chapter "${chapter.title}" and everything inside it?`}
          />
        }
      >
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

        <QuickAdd
          className="mt-3"
          courseId={courseId}
          kind="groups"
          parentId={chapter.id}
          placeholder="Add class type, e.g. Foundation Class"
          suggestions={suggestions}
          hint="A class type groups patrols inside a chapter. Pick one above, or type your own."
        />
      </CollapsibleSection>
    </div>
  );
}
