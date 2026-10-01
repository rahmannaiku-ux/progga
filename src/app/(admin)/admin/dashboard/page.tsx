import Link from "next/link";
import { FileClock } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { dhakaStartOfMonth, formatDhakaDateTime } from "@/lib/timezone";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [
    studentCount,
    teacherCount,
    courseCount,
    publishedCount,
    certCount,
    activeToday,
    recentLogs,
    paymentsAwaiting,
    paidThisMonth,
  ] = await Promise.all([
    db.user.count({ where: { role: "STUDENT" } }),
    db.user.count({ where: { role: "TEACHER" } }),
    db.course.count(),
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.certificate.count({ where: { status: "ISSUED" } }),
    db.user.count({
      where: { lastLoginAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    db.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.payment.count({ where: { status: "AWAITING_VERIFICATION" } }),
    db.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: "PAID", verifiedAt: { gte: dhakaStartOfMonth() } },
    }),
  ]);

  // Money that needs a human comes first; the rest is a reference strip.
  const stats = [
    { label: "Heroes", value: studentCount, href: "/admin/heroes" },
    { label: "Mentors", value: teacherCount, href: "/admin/mentors" },
    { label: "Missions", value: courseCount, sub: `${publishedCount} published`, href: "/admin/missions" },
    { label: "Medals issued", value: certCount, href: "/admin/medals" },
    { label: "Active in 24h", value: activeToday, href: "/admin/reports" },
  ];

  return (
    <StaggerContainer>
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Admin dashboard</h1>
      </StaggerItem>

      <StaggerItem className="mt-6">
        <Link
          href="/admin/payments"
          className={
            "hover-glow-card block p-5 sm:p-6 " +
            (paymentsAwaiting > 0 ? "comic-panel-bold bg-xp text-xp-foreground" : "comic-panel bg-surface")
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <p className="text-sm font-bold">
                {paymentsAwaiting > 0
                  ? `${paymentsAwaiting} payment${paymentsAwaiting === 1 ? "" : "s"} waiting for you to verify`
                  : "No payments waiting"}
              </p>
              <p className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">
                {formatMoney(paidThisMonth._sum.amountCents ?? 0, "BDT")}
              </p>
              <p className="text-xs opacity-80">verified this month</p>
            </div>
            <span className="text-sm font-bold underline underline-offset-4">Open payments</span>
          </div>
        </Link>
      </StaggerItem>

      <StaggerItem className="comic-panel mt-5 bg-surface">
        <div className="grid grid-cols-2 divide-border/20 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="block p-4 hover:bg-muted/60 sm:p-5">
              <p className="font-display text-2xl font-extrabold text-foreground">{s.value}</p>
              <p className="text-sm font-semibold text-muted-foreground">{s.label}</p>
              {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
            </Link>
          ))}
        </div>
      </StaggerItem>

      <StaggerItem className="comic-panel mt-8 bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
            <FileClock className="h-4 w-4" /> Recent activity
          </h2>
          <Link href="/admin/activity-logs" className="text-xs font-semibold text-accent hover:text-accent/80">
            View all
          </Link>
        </div>
        <ul className="mt-3 space-y-2">
          {recentLogs.map((log) => (
            <li key={log.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {log.user.firstName} {log.user.lastName}
                </span>{" "}
                {log.action.toLowerCase().replace("_", " ")} {log.entityType}
              </span>
              <span className="text-muted-foreground">
                {formatDhakaDateTime(log.createdAt)}
              </span>
            </li>
          ))}
          {recentLogs.length === 0 && (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          )}
        </ul>
      </StaggerItem>
    </StaggerContainer>
  );
}
