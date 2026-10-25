import Link from "next/link";
import { AdminBirthdaySection } from "@/components/admin-dashboard/admin-birthday-section";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { formatDhakaDate, formatDhakaDateTime } from "@/lib/timezone";
import { formatMoney, PAYMENT_STATUS_META } from "@/lib/payments/format";
import { paymentCourseTitle } from "@/lib/payments/course-title";
import { AdminStudentEditor } from "@/components/admin-dashboard/admin-student-editor";
import { CancelDeletionButton } from "@/components/admin-dashboard/account-deletion-admin";
import type { DeletedAccountSummary } from "@/lib/account-deletion";

/**
 * Admin-only view of one user's full record — most importantly the
 * mandatory first-login profile form (StudentProfile) every student
 * fills in, which is otherwise visible nowhere in the admin panel.
 * Students can be edited in full from here. Role and suspension changes stay
 * on the list page's UserRowControls so there's still exactly one place those
 * happen.
 */
export default async function AdminUserDetailPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
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
      isActive: true,
      headline: true,
      bio: true,
      deletionRequestedAt: true,
      deletionScheduledFor: true,
      deletionReason: true,
      deletedAt: true,
      deletedSummary: true,
      avatarUrl: true,
      heroStats: { select: { xp: true, currentStreak: true, longestStreak: true, coinBalance: true } },
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
          dateOfBirth: true,
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
          courseTitle: true,
        },
      },
    },
  });
  if (!user) notFound();

  const profile = user.studentProfile;
  const deleted = user.deletedAt ? (user.deletedSummary as DeletedAccountSummary | null) : null;
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
        {user.deletedAt && <Badge variant="outline">Deleted</Badge>}
        {!user.deletedAt && user.deletionScheduledFor && <Badge variant="outline">Deletion scheduled</Badge>}
      </div>

      {!user.deletedAt && user.deletionScheduledFor && (
        <section className="comic-panel mt-6 border-danger/50 bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-foreground">Account deletion scheduled</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Asked {user.deletionRequestedAt ? formatDhakaDateTime(user.deletionRequestedAt) : "earlier"}. Personal data is
            erased on {formatDhakaDate(user.deletionScheduledFor)} unless the student signs in and keeps the account.
          </p>
          {user.deletionReason && <p className="mt-2 break-words text-sm text-foreground">Reason: “{user.deletionReason}”</p>}
          <CancelDeletionButton userId={user.id} />
        </section>
      )}

      {user.deletedAt && (
        <section className="comic-panel mt-6 bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-foreground">Deleted account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Erased {formatDhakaDateTime(user.deletedAt)}. This is the record kept for payment questions.
          </p>
          {deleted && (
            <FieldGrid
              fields={[
                ["Name", deleted.name],
                ["Phone", deleted.phone],
                ["District", deleted.district],
                ["College", deleted.college],
                ["HSC batch", deleted.hscBatch],
                ["Joined", formatDhakaDate(new Date(deleted.joinedAt))],
                ["Deletion asked", deleted.deletionRequestedAt ? formatDhakaDate(new Date(deleted.deletionRequestedAt)) : null],
                ["Reason", deleted.reason],
                ["Missions", deleted.missions.map((m) => m.title).join(", ") || null],
                ["Paid orders", `${deleted.paidOrders} · ${formatMoney(deleted.paidTotalCents)}`],
              ]}
            />
          )}
        </section>
      )}

      {user.role === "STUDENT" && !user.deletedAt && (
        <section className="comic-panel mt-6 bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-foreground">Edit student</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change anything on this student&apos;s profile. Every save is recorded in the activity log.
          </p>
          <div className="mt-5">
            <AdminStudentEditor
              userId={user.id}
              hasAvatar={Boolean(user.avatarUrl)}
              initialStats={{
                xp: user.heroStats?.xp ?? 0,
                currentStreak: user.heroStats?.currentStreak ?? 0,
                longestStreak: user.heroStats?.longestStreak ?? 0,
                coinBalance: user.heroStats?.coinBalance ?? 0,
              }}
              initial={{
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email ?? "",
                phone: user.phone ?? "",
                phoneVerified: user.phoneVerified,
                headline: user.headline ?? "",
                bio: user.bio ?? "",
                profileCompleted: user.profileCompleted,
                isActive: user.isActive,
                name: profile?.name ?? "",
                district: profile?.district ?? "",
                zipCode: profile?.zipCode ?? "",
                collegeName: profile?.collegeName ?? "",
                collegeEIIN: profile?.collegeEIIN ?? "",
                fatherPhone: profile?.fatherPhone ?? "",
                motherPhone: profile?.motherPhone ?? "",
                hscBatch: profile?.hscBatch ?? "",
                studyVersion: profile?.studyVersion ?? "",
                dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : "",
              }}
            />
          </div>
        </section>
      )}

      {user.role === "STUDENT" && <AdminBirthdaySection userId={user.id} />}

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">Enrollments ({user.enrollments.length})</h2>
          {user.enrollments.length > 0 && user.phone && (
            <Link
              href={`/admin/mission-switches?student=${encodeURIComponent(user.phone)}`}
              className="inline-flex min-h-9 items-center text-sm font-semibold text-accent hover:underline"
            >
              Switch mission
            </Link>
          )}
        </div>
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
                    <span className="min-w-0 break-words text-foreground">{paymentCourseTitle(p)}</span>
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
