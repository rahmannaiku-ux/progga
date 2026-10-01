import { Youtube, FileText, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDhakaDateTime } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { ExpandableRow } from "@/components/mentor-dashboard/expandable-row";
import { MENU_ITEM_CLASS } from "@/components/mentor-dashboard/builder-menu-items";
import { ResourceUploader } from "@/components/mentor-dashboard/resource-uploader";
import { ImageUploadField } from "@/components/mentor-dashboard/image-upload-field";
import { LinkResourceForm } from "@/components/mentor-dashboard/link-resource-form";
import { ResourceDownloadToggle } from "@/components/mentor-dashboard/resource-download-toggle";
import { googleDownloadUrl } from "@/lib/google-embed";
import {
  updateLesson,
  deleteLesson,
  deleteLessonResource,
} from "@/server/actions/mission-actions";

type LessonWithResources = {
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
};

const FIELD =
  "h-11 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:h-10 md:text-sm";
const LABEL = "mb-1 block text-[11px] font-semibold text-muted-foreground";

export function LessonRow({
  courseId,
  groupId,
  lesson,
}: {
  courseId: string;
  groupId: string;
  lesson: LessonWithResources;
}) {
  const boundUpdate = updateLesson.bind(null, courseId);
  const boundDelete = deleteLesson.bind(null, courseId, lesson.id);
  const boundDeleteResource = (resourceId: string) =>
    deleteLessonResource.bind(null, courseId, resourceId);

  const summary = (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
        <Youtube className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground">{lesson.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
          <span>{lesson.youtubeVideoId ? "YouTube" : "No video set"}</span>
          <span aria-hidden>•</span>
          <span>{Math.round(lesson.durationSeconds / 60)} min</span>
          {lesson.isPreview && <Badge variant="outline">Preview</Badge>}
          {lesson.scheduledStart && (
            <Badge variant="outline">Live · {formatDhakaDateTime(lesson.scheduledStart)}</Badge>
          )}
          {lesson.resources.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" /> {lesson.resources.length}
            </span>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <ExpandableRow
      summary={summary}
      menuLabel={`More actions for ${lesson.title}`}
      editLabel={`Edit patrol ${lesson.title}`}
      menu={
        <ConfirmDeleteButton
          action={boundDelete}
          confirmMessage={`Delete "${lesson.title}"? This can't be undone.`}
          label="Delete patrol"
          className={`${MENU_ITEM_CLASS} text-danger hover:text-danger`}
        />
      }
    >
      <form action={boundUpdate} className="space-y-3">
        <input type="hidden" name="lessonId" value={lesson.id} />
        <input type="hidden" name="groupId" value={groupId} />
        <div>
          <label className={LABEL}>Title</label>
          <input name="title" defaultValue={lesson.title} required className={FIELD} placeholder="Title" />
        </div>
        <div>
          <label className={LABEL}>YouTube URL</label>
          <input
            name="youtubeUrl"
            defaultValue={lesson.youtubeVideoId ? `https://youtu.be/${lesson.youtubeVideoId}` : ""}
            required
            className={FIELD}
            placeholder="YouTube URL"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Duration (seconds)</label>
            <input
              name="durationSeconds"
              type="number"
              defaultValue={lesson.durationSeconds}
              min={0}
              className={FIELD}
              placeholder="Duration (seconds)"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-foreground">
            <input type="checkbox" name="isPreview" defaultChecked={lesson.isPreview} className="h-4 w-4" />
            Free preview patrol
          </label>
        </div>
        <ImageUploadField
          name="thumbnailUrl"
          context="LESSON_THUMBNAIL"
          label="Thumbnail picture"
          initialUrl={lesson.thumbnailUrl}
          maxSide={1280}
        />
        <div>
          <label className={LABEL}>Description (optional)</label>
          <textarea
            name="description"
            defaultValue={lesson.description ?? ""}
            rows={2}
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:text-sm"
            placeholder="Description (optional)"
          />
        </div>
        {lesson.scheduledStart && (
          <p className="text-[11px] text-muted-foreground">
            Live class set for {formatDhakaDateTime(lesson.scheduledStart)}. Change it from the Live Classes page.
          </p>
        )}
        <Button type="submit" variant="accent" className="h-11 w-full sm:w-auto">
          Save changes
        </Button>
      </form>

      <div className="space-y-2 border-t border-border/40 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Resources</p>
        {lesson.resources.length > 0 && (
          <ul className="space-y-1">
            {lesson.resources.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface/60 px-2.5 py-1.5 text-xs text-muted-foreground"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{r.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {(r.type !== "LINK" || googleDownloadUrl(r.url) !== null) && (
                    <ResourceDownloadToggle courseId={courseId} resourceId={r.id} initial={r.downloadable} downloads={r.downloadCount} />
                  )}
                  <ConfirmDeleteButton
                    action={boundDeleteResource(r.id)}
                    confirmMessage={`Remove "${r.title}"?`}
                    label="Remove"
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <ResourceUploader courseId={courseId} lessonId={lesson.id} />
          <LinkResourceForm courseId={courseId} lessonId={lesson.id} />
        </div>
      </div>
    </ExpandableRow>
  );
}
