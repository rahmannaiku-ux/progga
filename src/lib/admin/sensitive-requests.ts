import { normalizeMsisdn } from "@/lib/payments/sms/amount";
import { MFS_PROVIDERS, type MfsProvider } from "@/lib/payments/sms/types";

/**
 * Rules for the two-person requests (SensitiveChangeRequest): what a request may carry and who may
 * decide it. Pure, so it is tested without a database; the service applies them.
 */

export type PaymentNumberPayload = { provider: MfsProvider; receivingNumber: string; displayName: string; enabled: boolean };
export type GrantAdminPayload = { userId: string };

export const REASON_MIN = 10;
export const REASON_MAX = 500;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseReason(raw: unknown): Parsed<string> {
  const reason = String(raw ?? "").trim();
  if (reason.length < REASON_MIN) return { ok: false, error: `Say why, in at least ${REASON_MIN} characters.` };
  if (reason.length > REASON_MAX) return { ok: false, error: `Keep the reason under ${REASON_MAX} characters.` };
  return { ok: true, value: reason };
}

export function parsePaymentNumberPayload(raw: {
  provider?: unknown;
  receivingNumber?: unknown;
  displayName?: unknown;
  enabled?: unknown;
}): Parsed<PaymentNumberPayload> {
  const provider = String(raw.provider ?? "");
  if (!(MFS_PROVIDERS as readonly string[]).includes(provider)) return { ok: false, error: "Choose bKash, Nagad, Rocket or Upay." };
  const number = normalizeMsisdn(String(raw.receivingNumber ?? ""));
  if (!number) return { ok: false, error: "Enter a valid 11-digit mobile number." };
  const displayName = String(raw.displayName ?? "").trim().slice(0, 60) || provider;
  return { ok: true, value: { provider: provider as MfsProvider, receivingNumber: number, displayName, enabled: raw.enabled !== false } };
}

/** Why `actor` may not approve or reject this request, or null when they may. */
export function decisionBlock(
  actor: { id: string; role: string },
  request: { status: string; requestedById: string }
): string | null {
  if (actor.role !== "SUPER_ADMIN") return "Only a super admin can approve or reject a request.";
  if (request.status !== "PENDING") return "This request has already been decided.";
  if (request.requestedById === actor.id) return "Someone else must decide your own request: that is the point of asking.";
  return null;
}
