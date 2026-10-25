import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { formatMoney } from "@/lib/payments/format";
import { AdminSwitchForm, SwitchRequestDecision } from "@/components/admin-dashboard/mission-switch-forms";

export const metadata = { title: "Mission switches — Proggaa Admin" };

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "bg-xp/25 text-xp-ink",
  AWAITING_PAYMENT: "bg-primary/15 text-primary",
  COMPLETED: "bg-accent/15 text-accent",
  REJECTED: "bg-danger/15 text-danger",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Request",
  AWAITING_PAYMENT: "Waiting for payment",
  COMPLETED: "Done",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/**
 * Students moving between missions. A student's first switch is their own; after that they ask
 * here and an admin approves (charging the price difference or waiving it) or rejects. Admins can
 * also switch any student directly.
 */
export default async function MissionSwitchesPage(props: { searchParams: Promise<{ student?: string }> }) {
  await requireRole("ADMIN");
  const { student } = await props.searchParams;

  const [requests, recent, courses] = await Promise.all([
    db.courseMigration.findMany({
      where: { status: "REQUESTED" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    }),
    db.courseMigration.findMany({
      where: { status: { not: "REQUESTED" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        handledBy: { select: { firstName: true, lastName: true } },
        payment: { select: { id: true, status: true } },
      },
    }),
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, priceCents: true, isFree: true },
    }),
  ]);
  const name = (u?: { firstName: string; lastName: string } | null) => `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() || "Student";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Mission switches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each student can switch missions once by themselves: free when the new mission costs the same or less, otherwise
          they pay the difference. After that, they ask here.
        </p>
      </header>

      <section aria-labelledby="requests-heading">
        <h2 id="requests-heading" className="font-display text-sm font-bold text-foreground">
          Requests waiting {requests.length > 0 && <span className="text-muted-foreground">({requests.length})</span>}
        </h2>
        <ul className="mt-3 space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="comic-panel bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-foreground">
                  <Link href={`/admin/users/${r.user.id}`} className="hover:text-primary">
                    {name(r.user)}
                  </Link>{" "}
                  <span className="font-normal text-muted-foreground">{r.user.phone}</span>
                </p>
                <span className="text-[11px] text-muted-foreground">{formatDhakaDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">
                {r.fromCourseTitle} → <span className="font-semibold">{r.toCourseTitle}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.differenceCents > 0 ? `Difference ${formatMoney(r.differenceCents)}` : "No difference to pay"}
              </p>
              {r.reason && <p className="mt-2 break-words text-sm text-muted-foreground">“{r.reason}”</p>}
              {r.fromCourseId && r.toCourseId && (
                <SwitchRequestDecision
                  requestId={r.id}
                  userId={r.userId}
                  fromCourseId={r.fromCourseId}
                  toCourseId={r.toCourseId}
                  hasDifference={r.differenceCents > 0}
                />
              )}
            </li>
          ))}
          {requests.length === 0 && <p className="text-xs text-muted-foreground">No requests waiting.</p>}
        </ul>
      </section>

      <section className="glass-panel p-5" aria-labelledby="direct-heading">
        <h2 id="direct-heading" className="font-display text-sm font-bold text-foreground">Switch a student</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Doesn&apos;t use up the student&apos;s own switch. They pay the difference unless you waive it.
        </p>
        <div className="mt-3">
          <AdminSwitchForm courses={courses} initialQuery={student ?? ""} />
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-display text-sm font-bold text-foreground">Recent switches</h2>
        <ul className="mt-3 divide-y divide-border/20 overflow-hidden rounded-2xl border border-border/30 bg-surface">
          {recent.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  <Link href={`/admin/users/${m.user.id}`} className="hover:text-primary">
                    {name(m.user)}
                  </Link>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{m.user.phone}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.fromCourseTitle} → {m.toCourseTitle}
                  {m.differenceCents > 0 && ` · ${formatMoney(m.differenceCents)}`}
                  {m.feeWaived && " · fee waived"}
                  {m.byAdmin ? ` · by ${name(m.handledBy)}` : " · student's own switch"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{formatDhakaDateTime(m.updatedAt)}</span>
                <span className={`sticker px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[m.status] ?? ""}`}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
              </div>
            </li>
          ))}
          {recent.length === 0 && <li className="p-3 text-xs text-muted-foreground">No switches yet.</li>}
        </ul>
      </section>
    </div>
  );
}
