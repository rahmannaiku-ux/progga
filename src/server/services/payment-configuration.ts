import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import type { PaymentNumberPayload } from "@/lib/admin/sensitive-requests";
import { writeAudit } from "@/server/services/payment-audit";
import { notifySuperAdmins } from "@/server/services/super-admin-alerts";

/**
 * Sets a provider's receiving number shown at checkout (bumps its own version on every change).
 * Callers have checked the right first: a super admin directly (payment-device-actions.ts), or an
 * approved two-person request (sensitive-requests.ts). Every change alerts all super admins.
 */
export async function applyPaymentConfiguration(actorId: string, p: PaymentNumberPayload) {
  const existing = await db.paymentConfiguration.findUnique({ where: { provider: p.provider } });
  await db.paymentConfiguration.upsert({
    where: { provider: p.provider },
    create: { provider: p.provider, receivingNumber: p.receivingNumber, displayName: p.displayName, enabled: p.enabled },
    update: { receivingNumber: p.receivingNumber, displayName: p.displayName, enabled: p.enabled, configurationVersion: { increment: 1 } },
  });
  await writeAudit({
    event: "paymentConfig.updated",
    actor: `user:${actorId}`,
    metadata: { provider: p.provider, enabled: p.enabled, previousNumberChanged: existing ? existing.receivingNumber !== p.receivingNumber : null },
  });
  if (!existing || existing.receivingNumber !== p.receivingNumber || existing.enabled !== p.enabled) {
    await notifySuperAdmins({
      title: "Payment receiving number changed",
      body: `${p.provider}: students now pay to ${p.receivingNumber}${existing ? ` (was ${existing.receivingNumber})` : ""}, ${p.enabled ? "on" : "off"}.`,
      linkUrl: "/admin/settings/payments",
    });
  }
  revalidatePath("/admin/settings/payments");
}
