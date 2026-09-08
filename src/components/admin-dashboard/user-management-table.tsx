import { db } from "@/lib/db/client";
import { formatDhakaDate } from "@/lib/timezone";
import { UserRowControls } from "@/components/admin-dashboard/user-row-controls";
import { Pagination } from "@/components/admin-dashboard/pagination";
import type { Role, Prisma } from "@prisma/client";

const PAGE_SIZE = 25;

export async function UserManagementTable({
  roleFilter,
  currentAdminId,
  currentAdminRole,
  page = 1,
  search,
  basePath,
}: {
  roleFilter?: Role;
  currentAdminId: string;
  currentAdminRole: Role;
  page?: number;
  search?: string;
  basePath: string;
}) {
  const safePage = Math.max(1, page);

  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isSuspended: true,
        createdAt: true,
        _count: { select: { enrollments: true, coursesAuthored: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canManageRoles = currentAdminRole === "SUPER_ADMIN";

  return (
    <div>
      <form method="GET" className="mb-4">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Search by name or email..."
          className="h-10 w-full max-w-sm rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        />
      </form>

      {/* Mobile: one card per user, in place of the table — same fields
          and the same UserRowControls actions, just stacked instead of
          columned, since a 5-column table can't fit 320-390px without
          forcing horizontal scroll on a page that doesn't need it. */}
      <div className="glass-panel md:hidden">
        {users.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No users found.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {users.map((u) => (
              <li key={u.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {u.firstName} {u.lastName}
                      {u.id === currentAdminId && (
                        <span className="ml-1.5 text-xs font-normal text-accent">(you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  {u.id === currentAdminId && (
                    <span className="sticker-badge shrink-0 bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {u.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Joined {formatDhakaDate(u.createdAt)}</span>
                  <span>
                    {u.role === "TEACHER"
                      ? `${u._count.coursesAuthored} missions`
                      : `${u._count.enrollments} enrollments`}
                  </span>
                </div>
                {u.id !== currentAdminId && (
                  <UserRowControls
                    userId={u.id}
                    currentRole={u.role}
                    isSuspended={u.isSuspended}
                    canManageRoles={canManageRoles}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border/60">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            basePath={basePath}
            extraParams={{ q: search }}
          />
        </div>
      </div>

      {/* Desktop: unchanged table, now scoped to md and up. */}
      <div className="glass-panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Joined</th>
              <th className="p-4 font-medium">Activity</th>
              <th className="p-4 font-medium">Role / Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/40 last:border-0">
                <td className="p-4 text-foreground">
                  {u.firstName} {u.lastName}
                  {u.id === currentAdminId && (
                    <span className="ml-1.5 text-xs text-accent">(you)</span>
                  )}
                </td>
                <td className="p-4 text-muted-foreground">{u.email}</td>
                <td className="p-4 text-muted-foreground">
                  {formatDhakaDate(u.createdAt)}
                </td>
                <td className="p-4 text-muted-foreground">
                  {u.role === "TEACHER"
                    ? `${u._count.coursesAuthored} missions`
                    : `${u._count.enrollments} enrollments`}
                </td>
                <td className="p-4">
                  {u.id === currentAdminId ? (
                    <span className="sticker-badge bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {u.role}
                    </span>
                  ) : (
                    <UserRowControls
                      userId={u.id}
                      currentRole={u.role}
                      isSuspended={u.isSuspended}
                      canManageRoles={canManageRoles}
                    />
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-border/60">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            basePath={basePath}
            extraParams={{ q: search }}
          />
        </div>
      </div>
    </div>
  );
}
