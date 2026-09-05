import { Youtube, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { ResourceUploader } from "@/components/mentor-dashboard/resource-uploader";
import { LinkResourceForm } from "@/components/mentor-dashboard/link-resource-form";
import {
  updateLesson,
  deleteLesson,
  deleteLessonResource,
} from "@/server/actions/mission-actions";

/** Same helper (and same server-local-time caveat) as the assessment
 *  editor and the earlier live-classes admin edit page used. */
function toLocalInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type LessonWithResources = {
  id: string;
  title: string;
  description: string | null;
  youtubeVideoId: string | null;
  durationSeconds: number;
  isPreview: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  resources: { id: string; title: string; url: string }[];
};

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

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Youtube className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-foreground">{lesson.title}</p>
            <p className="text-xs text-muted-foreground">
              {lesson.youtubeVideoId ?? "no video set"} ·{" "}
              {Math.round(lesson.durationSeconds / 60)} min
              {lesson.isPreview && (
                <>
                  {" "}
                  · <Badge variant="outline">Preview</Badge>
                </>
              )}
              {lesson.scheduledStart && (
                <>
                  {" "}
                  · <Badge variant="outline">Live · {lesson.scheduledStart.toLocaleString()}</Badge>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <details className="relative">
            <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:text-accent/80">
              Edit
            </summary>
            <form
              action={boundUpdate}
              className="absolute right-0 z-10 mt-2 w-80 space-y-2 rounded-xl border border-border/60 bg-background p-4 shadow-glass"
            >
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="groupId" value={groupId} />
              <input
                name="title"
                defaultValue={lesson.title}
                required
                className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
                placeholder="Title"
              />
              <input
                name="youtubeUrl"
                defaultValue={
                  lesson.youtubeVideoId
                    ? `https://youtu.be/${lesson.youtubeVideoId}`
                    : ""
                }
                required
                className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
                placeholder="YouTube URL"
              />
              <textarea
                name="description"
                defaultValue={lesson.description ?? ""}
                rows={2}
                className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground md:text-xs"
                placeholder="Description (optional)"
              />
              <input
                name="durationSeconds"
                type="number"
                defaultValue={lesson.durationSeconds}
                min={0}
                className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
                placeholder="Duration (seconds)"
              />
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  name="isPreview"
                  defaultChecked={lesson.isPreview}
                />
                Free preview lesson
              </label>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  Live class schedule (leave blank for a recorded lesson)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    name="scheduledStart"
                    defaultValue={toLocalInputValue(lesson.scheduledStart)}
                    className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-xs"
                  />
                  <input
                    type="datetime-local"
                    name="scheduledEnd"
                    defaultValue={toLocalInputValue(lesson.scheduledEnd)}
                    className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-xs"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" variant="accent" className="w-full">
                Save changes
              </Button>
            </form>
          </details>
          <ConfirmDeleteButton
            action={boundDelete}
            confirmMessage={`Delete "${lesson.title}"? This can't be undone.`}
          />
        </div>
      </div>

      {lesson.resources.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border/40 pt-2">
          {lesson.resources.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> {r.title}
              </span>
              <ConfirmDeleteButton
                action={boundDeleteResource(r.id)}
                confirmMessage={`Remove "${r.title}"?`}
                label="Remove"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <ResourceUploader courseId={courseId} lessonId={lesson.id} />
        <LinkResourceForm courseId={courseId} lessonId={lesson.id} />
      </div>
    </div>
  );
}
