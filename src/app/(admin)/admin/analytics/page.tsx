import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 25;

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireRole("ADMIN");

  const page = parsePageParam(searchParams.page);

  const [courses, total] = await Promise.all([
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        enrollments: { select: { status: true, progressPct: true } },
        reviews: { select: { rating: true } },
      },
    }),
    db.course.count({ where: { status: "PUBLISHED" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Course analytics
      </h1>

      {/* Mobile: cards, metrics laid out as a compact grid per mission. */}
      <div className="glass-panel mt-6 md:hidden">
        {courses.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No published missions yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {courses.map((c) => {
              const total = c.enrollments.length;
              const completed = c.enrollments.filter((e) => e.status === "COMPLETED").length;
              const avgProgress = total
                ? Math.round(c.enrollments.reduce((s, e) => s + e.progressPct, 0) / total)
                : 0;
              const avgRating = c.reviews.length
                ? (c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length).toFixed(1)
                : "—";
              return (
                <li key={c.id} className="space-y-2.5 p-4">
                  <div>
                    <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.teacher.firstName} {c.teacher.lastName}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{total}</p>
                      <p className="text-[10px] text-muted-foreground">Enrolled</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{avgProgress}%</p>
                      <p className="text-[10px] text-muted-foreground">Avg. progress</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">
                        {total ? Math.round((completed / total) * 100) : 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Completion</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{avgRating}</p>
                      <p className="text-[10px] text-muted-foreground">Rating</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <div className="glass-panel mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Mission</th>
              <th className="p-4 font-medium">Mentor</th>
              <th className="p-4 font-medium">Enrolled</th>
              <th className="p-4 font-medium">Avg. progress</th>
              <th className="p-4 font-medium">Completion</th>
              <th className="p-4 font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const total = c.enrollments.length;
              const completed = c.enrollments.filter((e) => e.status === "COMPLETED").length;
              const avgProgress = total
                ? Math.round(c.enrollments.reduce((s, e) => s + e.progressPct, 0) / total)
                : 0;
              const avgRating = c.reviews.length
                ? (c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length).toFixed(1)
                : "—";
              return (
                <tr key={c.id} className="border-b border-border/40 last:border-0">
                  <td className="p-4 text-foreground">{c.title}</td>
                  <td className="p-4 text-muted-foreground">
                    {c.teacher.firstName} {c.teacher.lastName}
                  </td>
                  <td className="p-4 text-muted-foreground">{total}</td>
                  <td className="p-4 text-muted-foreground">{avgProgress}%</td>
                  <td className="p-4 text-muted-foreground">
                    {total ? Math.round((completed / total) * 100) : 0}%
                  </td>
                  <td className="p-4 text-muted-foreground">{avgRating}</td>
                </tr>
              );
            })}
            {courses.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No published missions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} basePath="/admin/analytics" />
    </div>
  );
}
