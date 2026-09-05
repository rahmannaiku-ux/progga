import { Users, GraduationCap, UserCog, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { UserManagementTable } from "@/components/admin-dashboard/user-management-table";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const admin = await requireRole("ADMIN");

  const [total, students, mentors, admins] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "STUDENT" } }),
    db.user.count({ where: { role: "TEACHER" } }),
    db.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
  ]);

  const stats = [
    { label: "Total Users", value: total, icon: Users },
    { label: "Students", value: students, icon: GraduationCap },
    { label: "Mentors", value: mentors, icon: UserCog },
    { label: "Admins", value: admins, icon: ShieldCheck },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        All users
      </h1>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="comic-panel bg-surface p-5">
            <span className="sticker flex h-9 w-9 items-center justify-center bg-accent/15">
              <s.icon className="h-4 w-4 text-accent" />
            </span>
            <p className="mt-2 font-display text-2xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <UserManagementTable
          currentAdminId={admin.id}
          currentAdminRole={admin.role}
          page={searchParams.page ? Number(searchParams.page) : 1}
          search={searchParams.q}
          basePath="/admin/users"
        />
      </div>
    </div>
  );
}
