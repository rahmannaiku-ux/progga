import Link from "next/link";
import { ProggyMascot, type MascotState } from "@/components/marketing/proggy-mascot";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet", said once and the same way everywhere: Proggy on the
 * left, a plain statement of what is missing, what will fill it, and the one
 * thing to do next. Left-aligned like the rest of the app, not a centred
 * icon-and-sentence placeholder.
 */
export function EmptyState({
  title,
  body,
  action,
  pose = "thinking",
  className,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  pose?: MascotState;
  className?: string;
}) {
  return (
    <div className={cn("comic-panel flex flex-col gap-4 bg-surface p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6", className)}>
      <ProggyMascot state={pose} className="h-20 w-20 shrink-0" />
      <div className="min-w-0">
        <p className="font-display text-lg font-extrabold leading-tight text-foreground">{title}</p>
        {body && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{body}</p>}
        {action && (
          <Link
            href={action.href}
            className="comic-btn mt-3 inline-flex min-h-11 items-center bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
