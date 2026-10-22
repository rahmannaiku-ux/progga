import { requireSuperAdmin } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { PromoteUserForm } from "@/components/admin-dashboard/promote-user-form";
import { ResetTwoStepForm } from "@/components/admin-dashboard/two-step-admin-tools";

const ROLE_DESCRIPTIONS = [
  { role: "STUDENT", desc: "Default role. Enrolls in missions, tracks progress, earns XP." },
  { role: "TEACHER", desc: "Authors missions, grades assignments/exams, sees analytics for their own courses." },
  {
    role: "ADMIN",
    desc: "The daily work: verifying payments, students and mentors, granting access, missions and content, moderation, reports. Asks a super admin (Requests) for a new payment receiving number or for admin access.",
  },
  {
    role: "SUPER_ADMIN",
    desc: "Everything an Admin can do, plus: admin roles, payment numbers, rules and devices, branding, email templates, Control Center, storage, apps, data export, activity logs, deleting missions. Approves admins' requests. The last active super admin can't be demoted or suspended.",
  },
];

export default async function RolesPermissionsPage() {
  const admin = await requireSuperAdmin();

  const recentChanges = await db.roleChangeLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    include: {
      targetUser: { select: { firstName: true, lastName: true } },
      changedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Roles & permissions
      </h1>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Role hierarchy
        </h2>
        <ul className="mt-3 space-y-2">
          {ROLE_DESCRIPTIONS.map((r) => (
            <li key={r.role} className="text-sm">
              <span className="font-mono font-semibold text-accent">{r.role}</span>
              <span className="text-muted-foreground"> — {r.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Change a user's role
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {admin.role === "SUPER_ADMIN"
            ? "As a super admin, you can grant any role, including Admin."
            : "You can promote users to Teacher. Granting Admin access requires a super admin."}
        </p>
        <div className="mt-3">
          <PromoteUserForm canGrantAdmin={admin.role === "SUPER_ADMIN"} />
        </div>
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Reset an admin&apos;s two-step sign-in</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          For an admin who lost their phone and recovery codes. They are signed out everywhere and set up a new
          authenticator at their next sign-in. Your own needs another super admin.
        </p>
        <div className="mt-3">
          <ResetTwoStepForm />
        </div>
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Recent role changes
        </h2>
        <ul className="mt-3 space-y-2">
          {recentChanges.map((c) => (
            <li key={c.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">
                {c.targetUser.firstName} {c.targetUser.lastName}
              </span>{" "}
              {c.fromRole} → {c.toRole} by{" "}
              <span className="text-foreground">
                {c.changedBy.firstName} {c.changedBy.lastName}
              </span>{" "}
              · {formatDhakaDateTime(c.createdAt)}
            </li>
          ))}
          {recentChanges.length === 0 && (
            <p className="text-xs text-muted-foreground">No role changes yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
