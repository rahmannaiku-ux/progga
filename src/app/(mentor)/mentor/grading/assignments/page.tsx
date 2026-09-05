import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";

export default async function AssignmentGradingQueuePage() {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const submissions = await db.assignmentSubmission.findMany({
    where: {
      status: { in: ["SUBMITTED", "LATE"] },
      assignment: isAdmin
        ? {}
        : { lesson: { group: { chapter: { module: { course: { teacherId: user.id } } } } } },
    },
    orderBy: { submittedAt: "asc" },
    include: {
      user: { select: { firstName: true, lastName: true } },
      assignment: { select: { title: true, maxPoints: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Assignment grading queue
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {submissions.length} submission{submissions.length === 1 ? "" : "s"} waiting.
      </p>

      <div className="mt-6 space-y-3">
        {submissions.map((s) => (
          <Link
            key={s.id}
            href={`/mentor/grading/assignments/${s.id}`}
            className="glass-panel flex items-center justify-between p-5"
          >
            <div>
              <p className="font-display font-semibold text-foreground">
                {s.assignment.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.user.firstName} {s.user.lastName} · {s.assignment.maxPoints} pts max
              </p>
            </div>
            {s.status === "LATE" && <Badge variant="outline">Late</Badge>}
          </Link>
        ))}
        {submissions.length === 0 && (
          <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
            Nothing waiting for review right now.
          </div>
        )}
      </div>
    </div>
  );
}
