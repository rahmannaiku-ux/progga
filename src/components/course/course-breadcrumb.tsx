import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type BreadcrumbStep = {
  label: string;
  href?: string; // omitted on the current (last) step
};

/**
 * Persistent "you are here" header for the Subject -> Chapter -> Class
 * Type -> Lessons drill-down. Every page below the top level renders this
 * instead of a bare back arrow, since four taps deep is easy to get lost
 * in on mobile — students always see the full parent path, and can jump
 * back to any ancestor in one tap, not just the immediate parent.
 */
export function CourseBreadcrumb({ steps }: { steps: BreadcrumbStep[] }) {
  const back = [...steps].reverse().find((s) => s.href);

  return (
    <div className="comic-panel bg-surface p-3.5">
      {back && (
        <Link
          href={back.href!}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Link>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {steps.map((step, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
            {step.href ? (
              <Link href={step.href} className="hover:text-foreground">
                {step.label}
              </Link>
            ) : (
              <span className="text-foreground">{step.label}</span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
