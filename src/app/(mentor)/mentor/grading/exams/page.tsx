import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDate } from "@/lib/timezone";

export default async function GradingQueuePage() {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const attempts = await db.assessmentAttempt.findMany({
    where: {
      status: "SUBMITTED",
      assessment: isAdmin
        ? {}
        : { course: { teacherId: user.id } },
    },
    orderBy: { submittedAt: "asc" },
    include: {
      user: { select: { firstName: true, lastName: true } },
      assessment: { select: { title: true, course: { select: { title: true } } } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Grading queue
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Essay and short-answer questions awaiting review.
      </p>

      <div className="mt-6 space-y-3">
        {attempts.map((a) => (
          <Link
            key={a.id}
            href={`/mentor/grading/exams/${a.id}`}
            className="glass-panel flex items-center justify-between p-5"
          >
            <div>
              <p className="font-display font-semibold text-foreground">
                {a.assessment.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.user.firstName} {a.user.lastName} · {a.assessment.course?.title ?? "Mission"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Submitted {a.submittedAt && formatDhakaDate(a.submittedAt)}
            </span>
          </Link>
        ))}
        {attempts.length === 0 && (
          <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
            Nothing waiting for review right now.
          </div>
        )}
      </div>
    </div>
  );
}
