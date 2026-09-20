import { Users, Flame } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Pagination } from "@/components/admin-dashboard/pagination";

const PAGE_SIZE = 25;

export default async function MentorStudentsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const mentor = await requireRole("TEACHER");
  const isAdmin = mentor.role === "ADMIN" || mentor.role === "SUPER_ADMIN";
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const courseFilter = isAdmin ? {} : { course: { teacherId: mentor.id } };

  const where = {
    ...courseFilter,
    ...(q
      ? {
          user: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [enrollments, total, activeToday, avgProgress] = await Promise.all([
    db.enrollment.findMany({
      where,
      orderBy: { enrolledAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, heroStats: true } },
        course: { select: { title: true } },
      },
    }),
    db.enrollment.count({ where }),
    db.enrollment.count({
      where: {
        ...courseFilter,
        user: { heroStats: { is: { lastActivityDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } } },
      },
    }),
    db.enrollment.aggregate({ _avg: { progressPct: true }, where: courseFilter }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-accent" />
        <h1 className="font-display text-2xl font-extrabold text-foreground">My students</h1>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="comic-panel bg-surface p-5 text-center">
          <p className="font-display text-2xl font-extrabold text-foreground">{total}</p>
          <p className="text-xs font-semibold text-muted-foreground">Total students</p>
        </div>
        <div className="comic-panel bg-surface p-5 text-center">
          <p className="font-display text-2xl font-extrabold text-foreground">{activeToday}</p>
          <p className="text-xs font-semibold text-muted-foreground">Active today</p>
        </div>
        <div className="comic-panel bg-surface p-5 text-center">
          <p className="font-display text-2xl font-extrabold text-foreground">
            {Math.round(avgProgress._avg.progressPct ?? 0)}%
          </p>
          <p className="text-xs font-semibold text-muted-foreground">Avg. completion</p>
        </div>
      </div>

      <form method="GET" className="mt-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search students..."
          className="w-full max-w-xs bg-surface px-3 py-2 text-base text-foreground"
        />
      </form>

      {/* Mobile: cards, one per student. */}
      <div className="comic-panel mt-4 bg-surface md:hidden">
        {enrollments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No students match yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {enrollments.map((e) => (
              <li key={e.id} className="space-y-1.5 px-4 py-3">
                <div>
                  <p className="truncate font-semibold text-foreground">
                    {e.user.firstName} {e.user.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{e.user.email}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{e.course.title}</p>
                <div className="flex items-center gap-3">
                  <span className="sticker-badge bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                    Lv.{e.user.heroStats?.level ?? 1}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                    <Flame className="h-3.5 w-3.5 fill-danger" /> {e.user.heroStats?.currentStreak ?? 0}
                  </span>
                  <span className="ml-auto font-mono text-xs text-foreground">
                    {Math.round(e.progressPct)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={totalPages} basePath="/mentor/students" extraParams={{ q }} />
      </div>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <div className="comic-panel mt-4 hidden overflow-x-auto bg-surface md:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b-2 border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Mission</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Streak</th>
              <th className="px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-foreground">
                    {e.user.firstName} {e.user.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{e.user.email}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.course.title}</td>
                <td className="px-4 py-3">
                  <span className="sticker-badge bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                    Lv.{e.user.heroStats?.level ?? 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                    <Flame className="h-3.5 w-3.5 fill-danger" /> {e.user.heroStats?.currentStreak ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{Math.round(e.progressPct)}%</td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No students match yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} basePath="/mentor/students" extraParams={{ q }} />
      </div>
    </div>
  );
}
