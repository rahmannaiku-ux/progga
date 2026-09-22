import { db } from "@/lib/db/client";
import type { MfsProvider } from "@/lib/payments/sms/types";

/**
 * The receiving number students are told to pay for a provider. The backend
 * is the single source of truth (never hardcoded in the Android app).
 * PaymentConfiguration wins; SiteSettings.bkashNumber remains the fallback
 * for bKash so existing installs keep working unchanged.
 */
export async function getReceivingNumber(provider: MfsProvider): Promise<string | null> {
  const cfg = await db.paymentConfiguration.findUnique({ where: { provider } });
  if (cfg) return cfg.enabled ? cfg.receivingNumber : null;
  if (provider === "BKASH") {
    const s = await db.siteSettings.findUnique({ where: { id: "singleton" }, select: { bkashNumber: true } });
    return s?.bkashNumber ?? null;
  }
  return null;
}
