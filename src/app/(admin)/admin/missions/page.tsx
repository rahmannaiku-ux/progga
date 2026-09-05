import Link from "next/link";
import { Tag } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { AdminCourseStatusControl } from "@/components/admin-dashboard/admin-course-status-control";
import { Pagination } from "@/components/admin-dashboard/pagination";
import { Badge } from "@/components/ui/badge";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { formatMoney } from "@/lib/payments/format";
import { computeDiscountedPriceCents, getDiscountStatus } from "@/lib/payments/discount";

const PAGE_SIZE = 25;

function MissionPrice({
  course,
}: {
  course: {
    id: string;
    isFree: boolean;
    priceCents: number;
    currency: string;
    discount: Parameters<typeof getDiscountStatus>[0];
  };
}) {
  if (course.isFree) return <span className="text-muted-foreground">Free</span>;
  const price = computeDiscountedPriceCents(course.priceCents, course.discount);
  const status = getDiscountStatus(course.discount);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 font-mono text-foreground">
        {formatMoney(price.finalCents, course.currency)}
        {price.isDiscounted && (
          <span className="text-xs text-muted-foreground line-through">
            {formatMoney(price.originalCents, course.currency)}
          </span>
        )}
      </div>
      <Link
        href={`/admin/missions/${course.id}/discount`}
        className="inline-flex w-fit items-center gap-1 text-xs text-accent hover:text-accent/80"
      >
        <Tag className="h-3 w-3" />
        {status === "none" ? "Add discount" : "Manage discount"}
        {status !== "none" && status !== "active" && (
          <Badge variant="outline" className="ml-1">
            {status}
          </Badge>
        )}
      </Link>
    </div>
  );
}

export default async function AdminMissionsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireRole("ADMIN");
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [courses, total] = await Promise.all([
    db.course.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { enrollments: true } },
        discount: {
          select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
        },
      },
    }),
    db.course.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <StaggerContainer>
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          All missions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} missions across every mentor.
        </p>
      </StaggerItem>

      {/* Mobile: cards. Each mission has enough per-row content (title,
          mentor, price + discount link, status control) that a 5-column
          table would either force horizontal scroll or clip below md,
          so this stacks the same fields and the same status control. */}
      <StaggerItem className="glass-panel mt-6 md:hidden">
        {courses.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No missions yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {courses.map((c) => (
              <li key={c.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/courses/${c.slug}`}
                      className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {c.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.teacher.firstName} {c.teacher.lastName} · {c._count.enrollments} enrolled
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <MissionPrice course={c} />
                  <AdminCourseStatusControl courseId={c.id} status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border/60">
          <Pagination page={page} totalPages={totalPages} basePath="/admin/missions" />
        </div>
      </StaggerItem>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <StaggerItem className="glass-panel mt-6 hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Title</th>
              <th className="p-4 font-medium">Mentor</th>
              <th className="p-4 font-medium">Enrolled</th>
              <th className="p-4 font-medium">Price</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-surface/60">
                <td className="p-4">
                  <Link
                    href={`/courses/${c.slug}`}
                    className="text-foreground hover:text-primary"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="p-4 text-muted-foreground">
                  {c.teacher.firstName} {c.teacher.lastName}
                </td>
                <td className="p-4 text-muted-foreground">{c._count.enrollments}</td>
                <td className="p-4">
                  <MissionPrice course={c} />
                </td>
                <td className="p-4">
                  <AdminCourseStatusControl courseId={c.id} status={c.status} />
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No missions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-border/60">
          <Pagination page={page} totalPages={totalPages} basePath="/admin/missions" />
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
