import Link from "next/link";
import { Radio, History } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { getLiveExamStatus } from "@/lib/live-exam";

/**
 * Teacher's "🔴 LIVE EXAMS" view — only assessments (across every
 * course this teacher owns) whose live monitoring window is currently
 * active. Computed on every request from getLiveExamStatus(), not a
 * stored/cron-updated field, so this is never stale.
 */
export default async function LiveExamsPage() {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const candidates = await db.assessment.findMany({
    where: {
      isLiveExam: true,
      publishedAt: { not: null },
      archivedAt: null,
      ...(isAdmin ? {} : { course: { teacherId: user.id } }),
    },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { questionLinks: true } },
      attempts: { select: { status: true } },
    },
  });

  const now = new Date();
  const live = candidates.filter((a) => getLiveExamStatus(a, now) === "LIVE");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
          <Radio className="h-6 w-6 text-danger" /> Live Exams
        </h1>
        <Link
          href="/mentor/exam-history"
          className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80"
        >
          <History className="h-4 w-4" /> Exam History
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {live.map((a) => {
          const started = a.attempts.length;
          const submitted = a.attempts.filter((att) =>
            ["SUBMITTED", "AUTO_SUBMITTED", "GRADED", "DISQUALIFIED"].includes(att.status)
          ).length;
          const takingNow = a.attempts.filter((att) => att.status === "IN_PROGRESS").length;

          return (
            <div key={a.id} className="glass-panel border-l-4 border-danger p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                <p className="text-xs font-bold uppercase tracking-wide text-danger">Live now</p>
              </div>
              <p className="mt-1 font-display text-lg font-semibold text-foreground">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.course?.title}</p>

              <p className="mt-2 text-xs text-muted-foreground">
                Live:{" "}
                {a.monitoringStartsAt &&
                  new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(a.monitoringStartsAt)}
                {" → "}
                {a.monitoringEndsAt &&
                  new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(a.monitoringEndsAt)}
              </p>

              <div className="mt-4 grid grid-cols-4 gap-3 text-center text-xs">
                <Stat label="Started" value={started} />
                <Stat label="Taking now" value={takingNow} />
                <Stat label="Submitted" value={submitted} />
                <Stat label="Questions" value={a._count.questionLinks} />
              </div>

              <Link
                href={`/mentor/live-exams/${a.id}`}
                className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Monitor Live Exam
              </Link>
            </div>
          );
        })}
        {live.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No exams are live right now.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="font-display text-base font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
