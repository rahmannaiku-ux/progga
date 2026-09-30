import Link from "next/link";
import { ArrowRight, ClipboardList, GraduationCap } from "lucide-react";

/** Dashboard shortcut to the student Exam Center (/exams) and Results (/results). */
export function ExamPortalCard() {
  return (
    <div className="comic-panel hover-glow-card flex flex-col gap-4 bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="sticker flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10">
          <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-extrabold text-foreground">Exam Portal</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            View available exams, upcoming exams and your exam attempts.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/exams"
          className="comic-btn inline-flex min-h-[44px] items-center justify-center gap-1.5 bg-primary px-5 py-2 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Go to Exams <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/results"
          className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-primary hover:underline"
        >
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> View Results
        </Link>
      </div>
    </div>
  );
}
