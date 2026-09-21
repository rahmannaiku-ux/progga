import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { assertOwnsCourse } from "@/server/actions/mission-actions";
import { TeamManager } from "@/components/mentor-dashboard/team-manager";
import { AvatarCropper } from "@/components/shared/avatar-cropper";

export default async function MentorTeamPage({ params }: { params: { missionId: string } }) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: {
      id: true,
      title: true,
      teacher: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, headline: true } },
      courseTeachers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          roleLabel: true,
          teacher: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, headline: true } },
        },
      },
    },
  });
  if (!course) notFound();

  await assertOwnsCourse(course.id, user.id, user.role);

  const assignedIds = new Set([course.teacher.id, ...course.courseTeachers.map((ct) => ct.teacher.id)]);
  const [eligibleTeachers, currentUser] = await Promise.all([
    db.user.findMany({
      where: { role: "TEACHER", isActive: true, isSuspended: false, id: { notIn: Array.from(assignedIds) } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    db.user.findUnique({ where: { id: user.id }, select: { firstName: true, avatarUrl: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mentor/missions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> My missions
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">
        Team — {course.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone assigned here shows up in the "Course Teachers" section on the buying page.
      </p>

      <div className="mt-8 glass-panel p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your photo</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Used everywhere your profile appears, including this mission's teacher showcase.
        </p>
        <div className="mt-4">
          <AvatarCropper currentUrl={currentUser?.avatarUrl ?? null} name={currentUser?.firstName ?? "You"} />
        </div>
      </div>

      <div className="mt-6">
        <TeamManager
          courseId={course.id}
          primaryTeacher={course.teacher}
          coTeachers={course.courseTeachers}
          eligibleTeachers={eligibleTeachers}
        />
      </div>
    </div>
  );
}
