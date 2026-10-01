import { LessonRow } from "@/components/mentor-dashboard/lesson-row";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { SubmitButton } from "@/components/shared/submit-button";
import { CollapsibleSection } from "@/components/mentor-dashboard/collapsible-section";
import { AddAction } from "@/components/mentor-dashboard/add-action";
import { OverflowMenu } from "@/components/mentor-dashboard/overflow-menu";
import { MENU_ITEM_CLASS, ReorderMenuItems } from "@/components/mentor-dashboard/builder-menu-items";
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

const FIELD =
  "h-11 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:h-10 md:text-sm";

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

  const addPatrol = (
    <>
      <QuickAdd
        courseId={courseId}
        kind="lessons"
        parentId={group.id}
        placeholder="Patrol title | YouTube link"
        bulkPlaceholder={"Patrol title | YouTube link\nPatrol title | YouTube link"}
        hint="One patrol per line. Add each thumbnail afterwards with Edit."
      />

      <details className="mt-3 border-t border-border/40 pt-3">
        <summary className="flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-accent hover:text-accent/80">
          Add with options (thumbnail, duration, free preview)
        </summary>
        <form action={boundCreateLesson} className="mt-2 space-y-3">
          <input type="hidden" name="groupId" value={group.id} />
          <input name="title" required placeholder="Patrol title" className={FIELD} />
          <input name="youtubeUrl" required placeholder="Paste a YouTube URL" className={FIELD} />
          <ImageUploadField
            name="thumbnailUrl"
            context="LESSON_THUMBNAIL"
            label="Thumbnail picture (optional)"
            maxSide={1280}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <input
              name="durationSeconds"
              type="number"
              min={0}
              placeholder="Duration (sec)"
              className={`${FIELD} sm:max-w-[11rem]`}
            />
            <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="isPreview" className="h-4 w-4" /> Free preview
            </label>
          </div>
          <SubmitButton
            pendingLabel="Adding patrol…"
            className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto sm:px-6"
          >
            Add patrol
          </SubmitButton>
        </form>
      </details>
    </>
  );

  return (
    <CollapsibleSection
      title={group.title}
      meta={`${group.lessons.length} patrol${group.lessons.length === 1 ? "" : "s"}`}
      titleClassName="text-sm font-semibold text-foreground"
      defaultOpen={false}
      actions={
        <OverflowMenu label={`More actions for ${group.title}`}>
          <ReorderMenuItems
            up={boundReorderUp}
            down={boundReorderDown}
            isFirst={isFirst}
            isLast={isLast}
            noun="class type"
          />
          <ConfirmDeleteButton
            action={boundDeleteGroup}
            confirmMessage={`Delete "${group.title}" and all its patrols?`}
            label="Delete class type"
            className={`${MENU_ITEM_CLASS} text-danger hover:text-danger`}
          />
        </OverflowMenu>
      }
    >
      {group.lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center">
          <p className="mb-3 text-xs text-muted-foreground">No patrols in {group.title} yet.</p>
          <AddAction label="Add patrol" primary className="text-left">
            {addPatrol}
          </AddAction>
        </div>
      ) : (
        <>
          <div className="space-y-0.5">
            {group.lessons.map((lesson) => (
              <LessonRow key={lesson.id} courseId={courseId} groupId={group.id} lesson={lesson} />
            ))}
          </div>
          <AddAction label="Add patrol" className="mt-1">
            {addPatrol}
          </AddAction>
        </>
      )}
    </CollapsibleSection>
  );
}
