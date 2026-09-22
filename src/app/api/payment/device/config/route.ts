import { db } from "@/lib/db/client";
import { authenticateDeviceRequest, json } from "@/server/services/device-guard";
import { getEffectiveConfigurations } from "@/server/services/provider-config";
import { MFS_PROVIDERS } from "@/lib/payments/sms/types";

export const runtime = "nodejs";

/**
 * GET /api/payment/device/config
 * Effective, validated, hash-checked sender/parser rules per provider, plus
 * the receiving numbers (display only — the server, not the app, decides
 * what an order must have been paid to). Authenticated; not cacheable.
 */
export async function GET(req: Request) {
  const auth = await authenticateDeviceRequest(req);
  if (!auth.ok) return auth.response;

  const [configs, numbers] = await Promise.all([
    getEffectiveConfigurations(),
    db.paymentConfiguration.findMany({ where: { enabled: true }, select: { provider: true, displayName: true, receivingNumber: true, configurationVersion: true } }),
  ]);

  return json({
    serverTime: Date.now(),
    providers: MFS_PROVIDERS,
    configurations: configs,
    receivingNumbers: numbers,
  });
}
