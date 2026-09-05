import { UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { GrantAccessForm } from "@/components/admin-dashboard/grant-access-form";

export default async function AdminEnrollmentsPage() {
  await requireRole("ADMIN");

  const courses = await db.course.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <UserPlus className="h-6 w-6" /> Grant Access
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enroll a student in any mission directly — free or paid — without going through checkout.
        The student gets the same confirmation email as a normal enrollment, and the grant is
        recorded in the activity log under your account.
      </p>

      <div className="mt-6">
        <GrantAccessForm courses={courses} />
      </div>
    </div>
  );
}
