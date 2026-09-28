"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { adminDeleteCourse } from "@/server/actions/admin-actions";
import { courseDeleteConfirmationPhrase, isCourseDeleteConfirmed } from "@/lib/validation/course-delete";

/**
 * Admin "Delete" for one mission. Opens a dialog that spells out what
 * will be removed and only enables the delete button once the admin has
 * typed `confirm delete <mission title>` exactly (re-verified server-side).
 */
export function DeleteMissionButton({
  courseId,
  title,
  enrollmentCount,
  paymentCount,
}: {
  courseId: string;
  title: string;
  enrollmentCount: number;
  paymentCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const phrase = courseDeleteConfirmationPhrase(title);
  const confirmed = isCourseDeleteConfirmed(typed, title);

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  function handleDelete() {
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminDeleteCourse(courseId, typed);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete this mission.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-danger hover:text-danger/80"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </DialogTrigger>
      <DialogContent
        title="Delete mission"
        description="This permanently deletes the mission and can't be undone."
        className="max-w-md"
      >
        <div className="space-y-4 p-4">
          <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0 space-y-1">
              <p>
                <span className="font-bold break-words">{title}</span> and all of its content (operations, lessons,
                exams, assignments, question bank, coupons, live classes) will be permanently deleted.
              </p>
              {(enrollmentCount > 0 || paymentCount > 0) && (
                <p className="font-semibold text-danger">
                  This also deletes {enrollmentCount} enrollment{enrollmentCount === 1 ? "" : "s"} and {paymentCount}{" "}
                  payment record{paymentCount === 1 ? "" : "s"}, plus students&apos; progress, exam attempts and
                  certificates for this mission.
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`confirm-${courseId}`} className="block text-sm text-foreground">
              To confirm, type{" "}
              <code className="select-all break-words rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-bold text-foreground">
                {phrase}
              </code>
            </label>
            <input
              id={`confirm-${courseId}`}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleDelete())}
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
              placeholder={phrase}
              className="mt-2 h-11 w-full rounded-xl border border-border/60 bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-danger"
            />
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <button
                type="button"
                disabled={isPending}
                className="h-10 rounded-xl border border-border/60 bg-surface px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || isPending}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-danger px-4 text-sm font-bold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              {isPending ? "Deleting…" : "Delete mission"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
