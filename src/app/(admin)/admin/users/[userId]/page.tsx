import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { formatDhakaDate, formatDhakaDateTime } from "@/lib/timezone";
import { formatMoney, PAYMENT_STATUS_META } from "@/lib/payments/format";

/**
 * Admin-only view of one user's full record — most importantly the
 * mandatory first-login profile form (StudentProfile) every student
 * fills in, which is otherwise visible nowhere in the admin panel.
 * Read-only on purpose: role/suspension changes stay on the list page's
 * UserRowControls so there's still exactly one place those happen.
 */
export default async function AdminUserDetailPage({ params }: { params: { userId: string } }) {
  await requireRole("ADMIN");

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phoneVerified: true,
      role: true,
      isSuspended: true,
      profileCompleted: true,
      createdAt: true,
      lastLoginAt: true,
      studentProfile: {
        select: {
          name: true,
          district: true,
          zipCode: true,
          collegeName: true,
          collegeEIIN: true,
          hscBatch: true,
          studyVersion: true,
          fatherPhone: true,
          motherPhone: true,
          updatedAt: true,
        },
      },
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        select: {
          id: true,
          status: true,
          progressPct: true,
          enrolledAt: true,
          course: { select: { title: true, slug: true } },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amountCents: true,
          currency: true,
          status: true,
          paymentReference: true,
          transactionId: true,
          couponCode: true,
          createdAt: true,
          course: { select: { title: true } },
        },
      },
    },
  });
  if (!user) notFound();

  const profile = user.studentProfile;
  const displayName =
    `${user.firstName} ${user.lastName}`.trim() || profile?.name?.trim() || user.phone || "Unnamed user";

  const accountFields: [string, React.ReactNode][] = [
    ["Phone", user.phone ? `${user.phone}${user.phoneVerified ? " (verified)" : ""}` : null],
    ["Email", user.email],
    ["Role", user.role],
    ["Status", user.isSuspended ? "Suspended" : "Active"],
    ["Joined", formatDhakaDate(user.createdAt)],
    ["Last login", user.lastLoginAt ? formatDhakaDateTime(user.lastLoginAt) : null],
  ];

  const profileFields: [string, React.ReactNode][] = profile
    ? [
        ["Full name", profile.name],
        ["District", profile.district],
        ["ZIP / postal code", profile.zipCode],
        ["College name", profile.collegeName],
        ["College EIIN", profile.collegeEIIN],
        ["HSC batch", profile.hscBatch],
        ["Study version", profile.studyVersion === "BANGLA" ? "Bangla" : profile.studyVersion === "ENGLISH" ? "English" : null],
        ["Father's phone", profile.fatherPhone],
        ["Mother's phone", profile.motherPhone],
      ]
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="break-words font-display text-2xl font-extrabold text-foreground">{displayName}</h1>
        <Badge variant="outline">{user.role}</Badge>
        {user.isSuspended && <Badge variant="outline">Suspended</Badge>}
      </div>

      <section className="glass-panel mt-6 p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Account</h2>
        <FieldGrid fields={accountFields} />
      </section>

      <section className="glass-panel mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Student profile form</h2>
          {user.role === "STUDENT" && (
            <Badge variant={user.profileCompleted ? "accent" : "outline"}>
              {user.profileCompleted ? "Completed" : "Not completed"}
            </Badge>
          )}
        </div>
        {profile ? (
          <>
            <FieldGrid fields={profileFields} />
            <p className="mt-3 text-xs text-muted-foreground">Last updated {formatDhakaDateTime(profile.updatedAt)}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">This user hasn&apos;t filled in the profile form yet.</p>
        )}
      </section>

      <section className="glass-panel mt-4 p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Enrollments ({user.enrollments.length})</h2>
        {user.enrollments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No enrollments.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/40">
            {user.enrollments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={`/courses/${e.course.slug}`} className="min-w-0 break-words text-foreground hover:text-primary">
                  {e.course.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {Math.round(e.progressPct)}% · {e.status.toLowerCase()} · {formatDhakaDate(e.enrolledAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel mt-4 p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Recent payments</h2>
        {user.payments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payments.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/40">
            {user.payments.map((p) => {
              const meta = PAYMENT_STATUS_META[p.status];
              return (
                <li key={p.id} className="space-y-1 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-foreground">{p.course.title}</span>
                    <span className="font-mono text-foreground">{formatMoney(p.amountCents, p.currency)}</span>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">
                    {meta.emoji} {meta.label} · {p.paymentReference}
                    {p.transactionId && ` · TXID ${p.transactionId}`}
                    {p.couponCode && ` · coupon ${p.couponCode}`} · {formatDhakaDateTime(p.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FieldGrid({ fields }: { fields: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
