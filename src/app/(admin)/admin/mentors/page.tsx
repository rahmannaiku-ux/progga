import { requireRole } from "@/lib/auth/require-role";
import { UserManagementTable } from "@/components/admin-dashboard/user-management-table";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

export default async function AdminMentorsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const admin = await requireRole("ADMIN");

  return (
    <StaggerContainer>
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Mentors
        </h1>
      </StaggerItem>
      <StaggerItem className="mt-6">
        <UserManagementTable
          roleFilter="TEACHER"
          currentAdminId={admin.id}
          currentAdminRole={admin.role}
          page={searchParams.page ? Number(searchParams.page) : 1}
          search={searchParams.q}
          basePath="/admin/mentors"
        />
      </StaggerItem>
    </StaggerContainer>
  );
}
