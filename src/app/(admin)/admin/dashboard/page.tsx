import Link from "next/link";
import { Users, GraduationCap, BookOpen, Activity, Award, FileClock, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { formatDhakaDateTime } from "@/lib/timezone";
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
      where: { status: "PAID", verifiedAt: { gte: new Date(new Date().setDate(1)) } },
    }),
  ]);

  const stats = [
    { label: "Heroes", value: studentCount, icon: GraduationCap, href: "/admin/heroes" },
    { label: "Mentors", value: teacherCount, icon: Users, href: "/admin/mentors" },
    { label: "Missions", value: courseCount, sub: `${publishedCount} published`, icon: BookOpen, href: "/admin/missions" },
    { label: "Medals issued", value: certCount, icon: Award, href: "/admin/medals" },
    { label: "Active (24h)", value: activeToday, icon: Activity, href: "/admin/reports" },
    {
      label: "Payments this month",
      value: formatMoney(paidThisMonth._sum.amountCents ?? 0, "BDT"),
      sub: paymentsAwaiting > 0 ? `${paymentsAwaiting} awaiting verification` : "All caught up",
      icon: Wallet,
      href: "/admin/payments",
    },
  ];

  return (
    <StaggerContainer>
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">👋 Admin dashboard</h1>
      </StaggerItem>

      <StaggerContainer className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <StaggerItem key={s.label}>
            <Link href={s.href} className="comic-panel hover-glow-card block bg-surface p-5">
              <span className="sticker flex h-9 w-9 items-center justify-center bg-accent/15">
                <s.icon className="h-4 w-4 text-accent" />
              </span>
              <p className="mt-2 font-display text-2xl font-extrabold text-foreground">{s.value}</p>
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
              {s.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</p>}
            </Link>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <StaggerItem className="comic-panel mt-8 bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
            <FileClock className="h-4 w-4" /> Recent activity
          </h2>
          <Link href="/admin/activity-logs" className="text-xs font-semibold text-accent hover:text-accent/80">
            View all →
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
