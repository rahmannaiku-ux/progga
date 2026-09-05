import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { CourseStatusBadge } from "@/components/mentor-dashboard/course-status-badge";

export default async function MentorMissionsPage() {
  const user = await requireRole("TEACHER");

  const courses = await db.course.findMany({
    where: { teacherId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { enrollments: true, modules: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            My missions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {courses.length} mission{courses.length === 1 ? "" : "s"} authored
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href="/mentor/missions/new">
            <Plus className="h-4 w-4" /> New mission
          </Link>
        </Button>
      </div>

      {courses.length > 0 ? (
        <div className="mt-8 space-y-3">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/mentor/missions/${c.id}/builder`}
              className="glass-panel flex items-center justify-between p-5 transition-transform hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center gap-3">
                  <p className="font-display font-semibold text-foreground">
                    {c.title}
                  </p>
                  <CourseStatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c._count.modules} operations · {c._count.enrollments} heroes enrolled
                </p>
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {c.isFree ? "Free" : `$${(c.priceCents / 100).toFixed(2)}`}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-panel mt-8 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            You haven't authored a mission yet.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <Link href="/mentor/missions/new">
              <Plus className="h-4 w-4" /> Create your first mission
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
