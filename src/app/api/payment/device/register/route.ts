import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateDeviceToken, hashToken } from "@/lib/payments/reference";
import { normalizeRegistrationCode, sha256Hex } from "@/lib/payments/sms/device-auth";
import { registerDeviceSchema } from "@/lib/validation/payment-device";
import { writeAudit } from "@/server/services/payment-audit";
import { deviceError, json, readJsonBody } from "@/server/services/device-guard";
import { logPayment } from "@/lib/payments/log";

export const runtime = "nodejs";

/**
 * POST /api/payment/device/register
 * Exchanges a one-time, short-lived registration code (issued by an admin)
 * for a per-device credential. The credential is returned exactly once and
 * only its SHA-256 is stored. The code is burned on use.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = await checkRateLimit("strict", `device-register:${ip}`);
  if (!rl.success) return deviceError(429, "RATE_LIMITED").response;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const parsed = registerDeviceSchema.safeParse(raw.body);
  if (!parsed.success) return deviceError(400, "INVALID_REQUEST").response;
  const { registrationCode, installId, appVersion, androidVersion, platform } = parsed.data;

  const codeHash = sha256Hex(normalizeRegistrationCode(registrationCode));
  const pending = await db.paymentBridgeDevice.findUnique({ where: { registrationCodeHash: codeHash } });
  // Uniform response for unknown / expired / revoked codes: don't help enumeration.
  if (!pending || !pending.isActive || !pending.registrationCodeExpiresAt || pending.registrationCodeExpiresAt.getTime() < Date.now()) {
    return deviceError(400, "REGISTRATION_CODE_INVALID").response;
  }

  // A revoked/inactive record no longer needs its installation binding (older revocations kept it): release it so
  // the same phone can register again. An ACTIVE record keeps its binding -> 409 below, on purpose.
  await db.paymentBridgeDevice.updateMany({ where: { installId, isActive: false }, data: { installId: null } });

  const credential = generateDeviceToken();
  try {
    // Single-use: the WHERE on the code hash makes only one concurrent redemption succeed.
    const claim = await db.paymentBridgeDevice.updateMany({
      where: { id: pending.id, registrationCodeHash: codeHash, isActive: true },
      data: {
        tokenHash: hashToken(credential),
        installId,
        platform,
        appVersion,
        androidVersion,
        registeredAt: new Date(),
        lastSeenAt: new Date(),
        registrationCodeHash: null,
        registrationCodeExpiresAt: null,
      },
    });
    if (claim.count !== 1) return deviceError(400, "REGISTRATION_CODE_INVALID").response;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // installId already bound to another device record.
      return deviceError(409, "INSTALLATION_ALREADY_REGISTERED").response;
    }
    throw err;
  }

  await writeAudit({ event: "device.registered", actor: `device:${pending.id}`, deviceId: pending.id, metadata: { appVersion, androidVersion } });
  logPayment("info", "device.registered", { deviceId: pending.id });
  return json({ deviceId: pending.id, name: pending.name, credential, serverTime: Date.now() }, 201);
}
