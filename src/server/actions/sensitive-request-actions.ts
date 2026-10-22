"use server";

import { requireAdminUser, requireSuperAdminUser } from "./require-user";
import { cancelRequest, decideRequest, requestGrantAdmin, requestPaymentNumber } from "@/server/services/sensitive-requests";
import { findUserByIdentifier } from "@/lib/auth/find-user-by-identifier";

/** Admin → Requests. Errors are returned, not thrown, so the person sees them (CLAUDE.md). */

export async function requestPaymentNumberAction(input: {
  provider: string;
  receivingNumber: string;
  displayName: string;
  enabled: boolean;
  reason: string;
}) {
  const admin = await requireAdminUser();
  return requestPaymentNumber(admin, input);
}

export async function requestGrantAdminAction(input: { identifier: string; reason: string }) {
  const admin = await requireAdminUser();
  let userId: string;
  try {
    userId = (await findUserByIdentifier(String(input.identifier ?? ""))).id;
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "No such user." };
  }
  return requestGrantAdmin(admin, { userId, reason: input.reason });
}

export async function decideRequestAction(input: { id: string; approve: boolean; note: string }) {
  const admin = await requireSuperAdminUser();
  return decideRequest(admin, String(input.id), input.approve === true, input.note);
}

export async function cancelRequestAction(id: string) {
  const admin = await requireAdminUser();
  return cancelRequest(admin, String(id));
}
