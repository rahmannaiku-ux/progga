import { db } from "@/lib/db/client";
import { heartbeatSchema } from "@/lib/validation/payment-device";
import { authenticateDeviceRequest, json, deviceError, readJsonBody } from "@/server/services/device-guard";
import { getEffectiveConfigurations } from "@/server/services/provider-config";

export const runtime = "nodejs";

/**
 * POST /api/payment/device/heartbeat
 * Device health report. Tells the app whether its provider rules are stale
 * so it can re-download them. The values stored here are the device's own
 * CLAIMS (used for the admin health screen), never used for any payment decision.
 */
export async function POST(req: Request) {
  const auth = await authenticateDeviceRequest(req);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const parsed = heartbeatSchema.safeParse(raw.body);
  if (!parsed.success) return deviceError(400, "INVALID_REQUEST").response;
  const hb = parsed.data;

  await db.paymentBridgeDevice.update({
    where: { id: auth.device.id },
    data: {
      lastSeenAt: new Date(),
      appVersion: hb.appVersion,
      androidVersion: hb.androidVersion,
      reportedConfigVersions: { ...hb.configVersions, smsPermissionGranted: hb.smsPermissionGranted, batteryOptimizationIgnored: hb.batteryOptimizationIgnored, queueDepth: hb.queueDepth },
    },
  });

  const effective = await getEffectiveConfigurations();
  const stale = effective.filter((c) => (hb.configVersions[c.provider] ?? 0) !== c.version).map((c) => c.provider);
  return json({ serverTime: Date.now(), configStaleFor: stale });
}
