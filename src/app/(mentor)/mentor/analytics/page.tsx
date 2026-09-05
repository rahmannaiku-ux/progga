import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";

export default async function MentorAnalyticsPage() {
  const user = await requireRole("TEACHER");

  const courses = await db.course.findMany({
    where: { teacherId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      enrollments: { select: { status: true, progressPct: true } },
      reviews: { select: { rating: true } },
    },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">
        My mission analytics
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enrollment, progress, and rating across every mission you've authored.
      </p>

      {/* Mobile: cards, metrics laid out as a compact grid per mission. */}
      <div className="glass-panel mt-6 md:hidden">
        {courses.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            You haven't authored any missions yet.
          </p>
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.status}</span>
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Mission</th>
              <th className="p-4 font-medium">Status</th>
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
                  <td className="p-4 text-muted-foreground">{c.status}</td>
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
                  You haven't authored any missions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
