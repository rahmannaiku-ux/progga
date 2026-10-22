import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  decisionBlock,
  parsePaymentNumberPayload,
  parseReason,
  type GrantAdminPayload,
  type PaymentNumberPayload,
} from "@/lib/admin/sensitive-requests";
import { isAdminRole } from "@/lib/auth/admin-hierarchy";
import { logAdminActivity, setUserRoleCore, type AdminActor } from "@/server/services/admin-tools";
import { applyPaymentConfiguration } from "@/server/services/payment-configuration";
import { notifySuperAdmins } from "@/server/services/super-admin-alerts";

/**
 * Two-person changes. An ADMIN asks for a new payment receiving number or for admin access for
 * someone; a SUPER_ADMIN other than the asker approves, and only then is it applied, through the
 * same code a super admin uses directly. Every step alerts all super admins and is logged.
 * Callers (server/actions/sensitive-request-actions.ts) have checked the session's role.
 */

type Result = { ok: true } | { ok: false; error: string };

function requireAdmin(actor: AdminActor) {
  if (!isAdminRole(actor.role)) throw new Error("Admin access required.");
}

export async function requestPaymentNumber(
  actor: AdminActor,
  input: { provider?: unknown; receivingNumber?: unknown; displayName?: unknown; enabled?: unknown; reason?: unknown }
): Promise<Result> {
  requireAdmin(actor);
  const payload = parsePaymentNumberPayload(input);
  if (!payload.ok) return payload;
  const reason = parseReason(input.reason);
  if (!reason.ok) return reason;
  const row = await db.sensitiveChangeRequest.create({
    data: {
      kind: "PAYMENT_NUMBER",
      payload: payload.value as unknown as Prisma.InputJsonValue,
      reason: reason.value,
      requestedById: actor.id,
    },
  });
  await logAdminActivity(actor.id, "CREATE", "SensitiveChangeRequest", row.id, { kind: "PAYMENT_NUMBER", ...payload.value });
  await notifySuperAdmins({
    title: "Approval needed: payment receiving number",
    body: `${payload.value.provider} → ${payload.value.receivingNumber}. Reason: ${reason.value}`,
    linkUrl: "/admin/requests",
  });
  revalidatePath("/admin/requests");
  return { ok: true };
}

export async function requestGrantAdmin(actor: AdminActor, input: { userId?: unknown; reason?: unknown }): Promise<Result> {
  requireAdmin(actor);
  const reason = parseReason(input.reason);
  if (!reason.ok) return reason;
  const target = await db.user.findUnique({
    where: { id: String(input.userId ?? "") },
    select: { id: true, role: true, firstName: true, lastName: true, isActive: true, isSuspended: true },
  });
  if (!target || !target.isActive || target.isSuspended) return { ok: false, error: "That account was not found or is not active." };
  if (isAdminRole(target.role)) return { ok: false, error: "That person is already an admin." };
  if (target.id === actor.id) return { ok: false, error: "You can't ask for your own access." };
  const open = await db.sensitiveChangeRequest.count({
    where: { kind: "GRANT_ADMIN", status: "PENDING", payload: { path: ["userId"], equals: target.id } },
  });
  if (open > 0) return { ok: false, error: "There is already an open request for this person." };
  const payload: GrantAdminPayload = { userId: target.id };
  const row = await db.sensitiveChangeRequest.create({
    data: { kind: "GRANT_ADMIN", payload, reason: reason.value, requestedById: actor.id },
  });
  const name = [target.firstName, target.lastName].filter(Boolean).join(" ") || "a user";
  await logAdminActivity(actor.id, "CREATE", "SensitiveChangeRequest", row.id, { kind: "GRANT_ADMIN", userId: target.id });
  await notifySuperAdmins({
    title: "Approval needed: admin access",
    body: `Make ${name} an admin. Reason: ${reason.value}`,
    linkUrl: "/admin/requests",
  });
  revalidatePath("/admin/requests");
  return { ok: true };
}

export async function decideRequest(
  actor: AdminActor,
  requestId: string,
  approve: boolean,
  note: unknown
): Promise<Result> {
  const req = await db.sensitiveChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) return { ok: false, error: "Request not found." };
  const blocked = decisionBlock(actor, req);
  if (blocked) return { ok: false, error: blocked };
  const decisionNote = String(note ?? "").trim().slice(0, 500) || null;

  // claim it first: two super admins clicking at once must not apply it twice
  const claimed = await db.sensitiveChangeRequest.updateMany({
    where: { id: req.id, status: "PENDING" },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote },
  });
  if (claimed.count !== 1) return { ok: false, error: "This request has already been decided." };

  if (approve) {
    try {
      if (req.kind === "PAYMENT_NUMBER") {
        const p = parsePaymentNumberPayload(req.payload as Partial<PaymentNumberPayload>);
        if (!p.ok) throw new Error(p.error);
        await applyPaymentConfiguration(actor.id, p.value);
      } else {
        const userId = String((req.payload as Partial<GrantAdminPayload>).userId ?? "");
        await setUserRoleCore(actor, userId, "ADMIN");
      }
    } catch (err) {
      // nothing was applied: put the request back so it can be decided again
      await db.sensitiveChangeRequest.update({
        where: { id: req.id },
        data: { status: "PENDING", decidedById: null, decidedAt: null, decisionNote: null },
      });
      return { ok: false, error: err instanceof Error ? err.message : "Could not apply the change." };
    }
  }

  await logAdminActivity(actor.id, approve ? "UPDATE" : "DELETE", "SensitiveChangeRequest", req.id, {
    kind: req.kind,
    decision: approve ? "approved" : "rejected",
  });
  await notifySuperAdmins({
    title: `Request ${approve ? "approved" : "rejected"}`,
    body: `${req.kind === "PAYMENT_NUMBER" ? "Payment receiving number" : "Admin access"} request ${approve ? "approved and applied" : "rejected"}.${decisionNote ? ` Note: ${decisionNote}` : ""}`,
    linkUrl: "/admin/requests",
  });
  await db.notification.create({
    data: {
      userId: req.requestedById,
      type: "SYSTEM",
      title: `Your request was ${approve ? "approved" : "rejected"}`,
      body: decisionNote ?? (approve ? "The change has been made." : "No change was made."),
      linkUrl: "/admin/requests",
    },
  });
  revalidatePath("/admin/requests");
  return { ok: true };
}

export async function cancelRequest(actor: AdminActor, requestId: string): Promise<Result> {
  requireAdmin(actor);
  const r = await db.sensitiveChangeRequest.updateMany({
    where: { id: requestId, requestedById: actor.id, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  if (r.count !== 1) return { ok: false, error: "Only your own open request can be withdrawn." };
  await logAdminActivity(actor.id, "DELETE", "SensitiveChangeRequest", requestId, { decision: "cancelled" });
  revalidatePath("/admin/requests");
  return { ok: true };
}
