"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { GroupLessonList, type GroupSidebarLesson } from "@/components/course/curriculum-sidebar";
import { backdropVariants } from "@/lib/motion";

/**
 * `lg:hidden` mobile equivalent of GroupSidebar — instead of consuming
 * permanent width beside the player (there's no room for that on a
 * phone), this renders as a compact "Chapter · N/M lessons" bar that
 * opens the same lesson list as a bottom sheet. Reuses GroupLessonList
 * so the actual list markup/data isn't duplicated between the two.
 */
export function MobileGroupSheet({
  basePath,
  groupTitle,
  lessons,
  activeLessonId,
}: {
  basePath: string;
  groupTitle: string;
  lessons: GroupSidebarLesson[];
  activeLessonId?: string;
}) {
  const [open, setOpen] = useState(false);
  const completedCount = lessons.filter((l) => l.isCompleted).length;
  const totalCount = lessons.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Lock background scroll while the sheet is open — same pattern as
  // MobileNavDrawer, so a phone can't scroll the page under the sheet.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="comic-panel flex min-h-11 w-full items-center justify-between gap-2 bg-surface px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold text-foreground">
            {groupTitle}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {completedCount}/{totalCount} patrols complete · {percent}%
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <motion.button
              type="button"
              aria-label="Close lesson list"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            />

            <motion.div
              role="dialog"
              aria-label={`${groupTitle} lessons`}
              className="relative flex max-h-[75vh] flex-col rounded-t-3xl border-t-[3px] border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0, transition: { duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] } }}
              exit={{ y: "100%", transition: { duration: 0.2 } }}
            >
              <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border" />

              <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-foreground">
                    {groupTitle}
                  </p>
                  <p className="mt-1.5">
                    <AnimatedProgressBar percent={percent} className="h-2" />
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                    {completedCount}/{totalCount} patrols complete · {percent}%
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="overflow-y-auto px-3 pb-4">
                <GroupLessonList
                  basePath={basePath}
                  lessons={lessons}
                  activeLessonId={activeLessonId}
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
