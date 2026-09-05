import Link from "next/link";
import { CheckCircle2, Circle, PlayCircle, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";

export type GroupSidebarLesson = {
  id: string;
  title: string;
  isCompleted: boolean;
};

/**
 * Shared list body — used by the desktop nav below and by
 * MobileGroupSheet's bottom-sheet body, so there's exactly one place
 * that renders "the list of lessons in this group."
 */
export function GroupLessonList({
  basePath,
  lessons,
  activeLessonId,
  onNavigate,
}: {
  basePath: string;
  lessons: GroupSidebarLesson[];
  activeLessonId?: string;
  /** Fired right before navigating — MobileGroupSheet uses this to close itself. */
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {lessons.map((lesson) => {
        const isActive = lesson.id === activeLessonId;
        return (
          <li key={lesson.id}>
            <Link
              href={`${basePath}/patrols/${lesson.id}`}
              onClick={onNavigate}
              prefetch={false}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl border-[2.5px] border-transparent px-2 py-1.5 text-sm transition-all duration-200",
                isActive
                  ? "animate-cartoon-pop border-border bg-primary/15 font-semibold text-primary"
                  : "text-foreground hover:border-border/60 hover:bg-surface hover:translate-x-0.5"
              )}
            >
              {isActive ? (
                <PlayCircle className="h-4 w-4 shrink-0 text-accent" />
              ) : lesson.isCompleted ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="line-clamp-1">{lesson.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Desktop companion on the lesson player — scoped to the CURRENT class
 * type only (siblings within the same LessonGroup), not the whole
 * course tree. The old version of this component rendered every module
 * -> chapter -> lesson in one giant accordion, which is the flat
 * "everything at once" structure students found overwhelming; this
 * repurposed version keeps a lightweight jump-list for the group the
 * student is already in, while CourseBreadcrumb (above the player)
 * handles moving between groups/chapters/subjects.
 *
 * Desktop-only (rendered inside a `hidden lg:block` wrapper by the
 * page) — MobileGroupSheet below is the `lg:hidden` equivalent.
 */
export function GroupSidebar({
  basePath,
  groupTitle,
  lessons,
  activeLessonId,
}: {
  basePath: string; // e.g. /missions/x/operations/y/chapters/z/groups/w
  groupTitle: string;
  lessons: GroupSidebarLesson[];
  activeLessonId?: string;
}) {
  const completedCount = lessons.filter((l) => l.isCompleted).length;
  const totalCount = lessons.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <nav className="comic-panel flex max-h-[80vh] flex-col overflow-hidden bg-surface p-0">
      <div className="border-b border-border/10 p-4">
        <p className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
          <Video className="h-4 w-4 text-primary" /> {groupTitle}
        </p>
        <div className="mt-2.5">
          <AnimatedProgressBar percent={percent} />
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
          {completedCount}/{totalCount} patrols complete · {percent}%
        </p>
      </div>

      <div className="overflow-y-auto p-3">
        <GroupLessonList basePath={basePath} lessons={lessons} activeLessonId={activeLessonId} />
      </div>
    </nav>
  );
}
