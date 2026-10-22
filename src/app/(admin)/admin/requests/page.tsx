import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { decisionBlock, type GrantAdminPayload, type PaymentNumberPayload } from "@/lib/admin/sensitive-requests";
import { PromoteUserForm } from "@/components/admin-dashboard/promote-user-form";
import { ReplaceRecoveryCodes } from "@/components/admin-dashboard/two-step-admin-tools";
import {
  GrantAdminRequestForm,
  PaymentNumberRequestForm,
  RequestDecision,
} from "@/components/admin-dashboard/sensitive-request-forms";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-xp/25 text-xp-ink",
  APPROVED: "bg-accent/15 text-accent",
  REJECTED: "bg-danger/15 text-danger",
  CANCELLED: "bg-muted text-muted-foreground",
};

/**
 * Two-person changes (docs/ADMIN-ROLES.md). An admin asks here for a new payment receiving number or
 * for admin access for someone; a super admin other than the asker approves or rejects. An admin can
 * still make someone a mentor directly.
 */
export default async function AdminRequestsPage() {
  const admin = await requireRole("ADMIN");
  const isSuper = admin.role === "SUPER_ADMIN";

  const requests = await db.sensitiveChangeRequest.findMany({
    // a super admin sees everyone's; an admin their own
    where: isSuper ? undefined : { requestedById: admin.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      requestedBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });
  const grantIds = requests
    .filter((r) => r.kind === "GRANT_ADMIN")
    .map((r) => String((r.payload as Partial<GrantAdminPayload>).userId ?? ""));
  const people = new Map(
    (
      await db.user.findMany({
        where: { id: { in: grantIds } },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
      })
    ).map((u) => [u.id, u])
  );
  const name = (u?: { firstName: string | null; lastName: string | null } | null) =>
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Someone";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">Requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSuper
          ? "Admins ask here for changes only a super admin may make. Approve or reject them; you can't decide your own."
          : "A new payment receiving number and admin access need a super admin. Ask here; nothing changes until one approves."}
      </p>

      <section className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">New payment receiving number</h2>
        <p className="mt-1 text-xs text-muted-foreground">Students only see the new number after a super admin approves it.</p>
        <div className="mt-3">
          <PaymentNumberRequestForm />
        </div>
      </section>

      <section className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Admin access for someone</h2>
        <div className="mt-3">
          <GrantAdminRequestForm />
        </div>
      </section>

      <section className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Make someone a mentor (no approval needed)</h2>
        <div className="mt-3">
          <PromoteUserForm canGrantAdmin={false} />
        </div>
      </section>

      <section className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Your two-step sign-in</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Lost or used up your recovery codes? Make new ones. Lost your phone? Ask a super admin to reset your two-step sign-in.
        </p>
        <div className="mt-3">
          <ReplaceRecoveryCodes />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-sm font-bold text-foreground">{isSuper ? "All requests" : "Your requests"}</h2>
        <ul className="mt-3 space-y-3">
          {requests.map((r) => {
            const pay = r.kind === "PAYMENT_NUMBER" ? (r.payload as Partial<PaymentNumberPayload>) : null;
            const who = r.kind === "GRANT_ADMIN" ? people.get(String((r.payload as Partial<GrantAdminPayload>).userId ?? "")) : null;
            const canDecide = r.status === "PENDING" && decisionBlock(admin, r) === null;
            const canCancel = r.status === "PENDING" && r.requestedById === admin.id;
            return (
              <li key={r.id} className="comic-panel bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-foreground">
                    {pay
                      ? `${pay.provider}: pay to ${pay.receivingNumber}${pay.displayName && pay.displayName !== pay.provider ? ` (${pay.displayName})` : ""}`
                      : `Make ${name(who)} an admin${who ? ` · ${who.phone ?? who.email ?? ""}` : ""}`}
                  </p>
                  <span className={`sticker shrink-0 px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
                </div>
                <p className="mt-1 break-words text-xs text-muted-foreground">“{r.reason}”</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Asked by {name(r.requestedBy)} · {formatDhakaDateTime(r.createdAt)}
                  {r.decidedAt && r.status !== "CANCELLED" && ` · ${r.status.toLowerCase()} by ${name(r.decidedBy)} · ${formatDhakaDateTime(r.decidedAt)}`}
                  {r.decisionNote && ` · “${r.decisionNote}”`}
                </p>
                {(canDecide || canCancel) && <RequestDecision id={r.id} canDecide={canDecide} canCancel={canCancel} />}
              </li>
            );
          })}
          {requests.length === 0 && <p className="text-xs text-muted-foreground">No requests yet.</p>}
        </ul>
      </section>
    </div>
  );
}
