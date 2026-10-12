import Link from "next/link";
import { Clock, UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { Button } from "@/components/ui/button";

const nameOf = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const STATUS_STYLE = {
  PENDING: { label: "Waiting for admin", className: "bg-xp/20 text-xp" },
  APPROVED: { label: "Approved", className: "bg-accent/20 text-accent" },
  REJECTED: { label: "Declined", className: "bg-danger/15 text-danger" },
} as const;

/**
 * Mentor: the starting point for sharing a mission with another mentor.
 * Lists the missions this mentor leads (each with a way to ask for a
 * co-mentor) and every request they have made, with the admin's answer.
 * The form itself lives on each mission's Team page.
 */
export default async function MentorCoMentorsPage() {
  const user = await requireRole("TEACHER");

  const [missions, requests] = await Promise.all([
    db.course.findMany({
      // Only the main mentor can ask for a co-mentor (see addCourseTeacher).
      where: { teacherId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        _count: { select: { courseTeachers: true, teacherRequests: { where: { status: "PENDING" } } } },
      },
    }),
    db.courseTeacherRequest.findMany({
      where: { OR: [{ requestedById: user.id }, { course: { teacherId: user.id } }] },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        roleLabel: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
        course: { select: { id: true, title: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Co-mentors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask for another mentor to share one of your missions. An admin reviews every request; once it is
          approved, that mentor can edit the mission, grade its work and run its live classes with you.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold text-foreground">Ask for a co-mentor</h2>
        {missions.length === 0 ? (
          <div className="glass-panel p-6 text-sm text-muted-foreground">
            <p>You can ask for a co-mentor on missions where you are the main mentor. You don&apos;t lead one yet.</p>
            <Button asChild variant="accent" size="sm" className="mt-4">
              <Link href="/mentor/missions/new">Create a mission</Link>
            </Button>
          </div>
        ) : (
          missions.map((m) => (
            <div key={m.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-display font-semibold text-foreground">{m.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m._count.courseTeachers} co-mentor{m._count.courseTeachers === 1 ? "" : "s"}
                  {m._count.teacherRequests > 0 ? ` · ${m._count.teacherRequests} waiting for an admin` : ""}
                </p>
              </div>
              <Button asChild variant="accent" size="sm">
                <Link href={`/mentor/missions/${m.id}/team#ask`}>
                  <UserPlus className="h-4 w-4" /> Ask for a co-mentor
                </Link>
              </Button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold text-foreground">Your requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="glass-panel p-6 text-sm text-muted-foreground">You haven&apos;t asked for a co-mentor yet.</p>
        ) : (
          requests.map((r) => {
            const status = STATUS_STYLE[r.status];
            return (
              <div key={r.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {nameOf(r.teacher)}
                    {r.roleLabel ? ` · ${r.roleLabel}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{r.course.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    {r.status === "PENDING" || !r.reviewedAt
                      ? `Asked ${formatDhakaDateTime(r.createdAt)}`
                      : `Reviewed ${formatDhakaDateTime(r.reviewedAt)}`}
                  </p>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="mt-1 text-xs font-medium text-danger">Reason: {r.rejectionReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`sticker shrink-0 px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
                    {status.label}
                  </span>
                  <Link
                    href={`/mentor/missions/${r.course.id}/team`}
                    className="text-xs font-semibold text-primary hover:text-primary/80"
                  >
                    Open team →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
