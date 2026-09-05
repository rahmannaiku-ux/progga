import Link from "next/link";
import { Users, Rocket, Wallet, Star, ClipboardCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

export default async function MentorDashboardPage() {
  const user = await requireRole("TEACHER");

  const [
    myCourses,
    totalStudents,
    totalEarnings,
    reviews,
    pendingSubmissions,
    recentSubmissions,
  ] = await Promise.all([
    db.course.findMany({ where: { teacherId: user.id }, select: { id: true, title: true } }),
    db.enrollment.count({ where: { course: { teacherId: user.id } } }),
    db.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: "PAID", course: { teacherId: user.id } },
    }),
    db.courseReview.aggregate({
      _avg: { rating: true },
      _count: true,
      where: { course: { teacherId: user.id } },
    }),
    db.assignmentSubmission.count({
      where: {
        status: { in: ["SUBMITTED", "LATE"] },
        assignment: { lesson: { group: { chapter: { module: { course: { teacherId: user.id } } } } } },
      },
    }),
    db.assignmentSubmission.findMany({
      where: {
        status: { in: ["SUBMITTED", "LATE"] },
        assignment: { lesson: { group: { chapter: { module: { course: { teacherId: user.id } } } } } },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
      include: {
        user: { select: { firstName: true, lastName: true } },
        assignment: {
          select: {
            title: true,
            lesson: { select: { group: { select: { chapter: { select: { module: { select: { course: { select: { title: true } } } } } } } } } },
          },
        },
      },
    }),
  ]);

  const stats = [
    { label: "Total Students", value: totalStudents.toLocaleString(), icon: Users },
    { label: "Total Missions", value: myCourses.length, icon: Rocket },
    { label: "Total Earnings", value: formatMoney(totalEarnings._sum.amountCents ?? 0, "BDT"), icon: Wallet },
    {
      label: "Reviews",
      value: reviews._count > 0 ? `${(reviews._avg.rating ?? 0).toFixed(1)} \u2605` : "\u2014",
      icon: Star,
    },
  ];

  return (
    <StaggerContainer>
      <StaggerItem className="comic-panel halftone-dots relative flex flex-wrap items-center justify-between gap-4 overflow-hidden bg-surface p-6">
        <div className="relative">
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Welcome back, mentor! 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingSubmissions > 0
              ? `${pendingSubmissions} submission${pendingSubmissions === 1 ? "" : "s"} waiting on your review.`
              : "No submissions waiting — you're all caught up."}
          </p>
        </div>
        <ProggyMascot state="welcoming" className="h-24 w-24 shrink-0" />
      </StaggerItem>

      <StaggerContainer className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StaggerItem key={s.label} className="comic-panel bg-surface p-5">
            <span className="sticker flex h-9 w-9 items-center justify-center bg-accent/15">
              <s.icon className="h-4 w-4 text-accent" />
            </span>
            <p className="mt-2 font-display text-2xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <StaggerItem className="comic-panel mt-6 bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
            <ClipboardCheck className="h-4 w-4" /> Recent submissions
          </h2>
          <Link href="/mentor/grading/assignments" className="text-xs font-semibold text-accent hover:text-accent/80">
            View all →
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {recentSubmissions.map((s) => (
            <Link
              key={s.id}
              href={`/mentor/grading/assignments/${s.id}`}
              className="hover-glow-card flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {s.user.firstName} {s.user.lastName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.assignment.title} · {s.assignment.lesson?.group.chapter.module.course.title ?? "\u2014"}
                </p>
              </div>
              <span className="sticker-badge shrink-0 bg-xp/15 px-2.5 py-1 text-[10px] font-bold text-xp">
                {s.status === "LATE" ? "Late" : "Pending"}
              </span>
            </Link>
          ))}
          {recentSubmissions.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Nothing waiting for review right now.</p>
          )}
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
