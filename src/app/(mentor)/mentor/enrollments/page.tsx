import { UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { MentorGrantAccessForm } from "@/components/mentor-dashboard/mentor-grant-access-form";

export default async function MentorEnrollmentsPage() {
  const user = await getCurrentUser();

  // Matches the same role check the grantCourseAccessAsMentor action
  // itself enforces (see mentor-actions.ts) — a plain TEACHER only
  // sees/can grant their own missions; ADMIN/SUPER_ADMIN visiting this
  // page see every mission, same as elsewhere in the mentor section.
  const courses = await db.course.findMany({
    where: user.role === "TEACHER" ? { teacherId: user.id } : undefined,
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <UserPlus className="h-6 w-6" /> Grant Access
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enroll a student in one of your missions directly — free or paid — without them going
        through checkout. They get the same confirmation email as a normal enrollment.
      </p>

      <div className="mt-6">
        <MentorGrantAccessForm courses={courses} />
      </div>
    </div>
  );
}
