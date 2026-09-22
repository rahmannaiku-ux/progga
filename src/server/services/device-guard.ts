import { Prisma } from "@prisma/client";
import type { PaymentBridgeDevice } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/payments/reference";
import { checkRequestTimestamp, isValidRequestId } from "@/lib/payments/sms/device-auth";
import { logPayment } from "@/lib/payments/log";

export const MAX_DEVICE_BODY_BYTES = 64 * 1024;

export type DeviceAuthResult =
  | { ok: true; device: PaymentBridgeDevice; requestId: string }
  | { ok: false; response: NextResponse };

function reject(status: number, code: string) {
  // Safe, uniform error shape: no internals, no stack traces.
  return { ok: false as const, response: NextResponse.json({ error: code, code }, { status }) };
}

/**
 * Authenticates an Android payment-device request. Order matters:
 *   bearer credential -> device active (revocation is checked on EVERY request)
 *   -> per-device rate limit -> timestamp window -> request-id replay ledger.
 * A revoked device gets 403 DEVICE_REVOKED so the app can stop and tell the operator.
 */
export async function authenticateDeviceRequest(req: Request): Promise<DeviceAuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 256) return reject(401, "UNAUTHORIZED");

  const device = await db.paymentBridgeDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  // Legacy bridge devices (no app registration) can't use the app API.
  if (!device || !device.registeredAt) return reject(401, "UNAUTHORIZED");
  if (!device.isActive) {
    logPayment("warn", "device.revoked_request", { deviceId: device.id });
    return reject(403, "DEVICE_REVOKED");
  }

  const rl = await checkRateLimit("device", `device:${device.id}`);
  if (!rl.success) return reject(429, "RATE_LIMITED");

  const ts = checkRequestTimestamp(req.headers.get("x-timestamp"), Date.now());
  if (!ts.ok) return reject(401, ts.reason === "INVALID" ? "TIMESTAMP_INVALID" : "TIMESTAMP_OUT_OF_WINDOW");

  const requestId = req.headers.get("x-request-id") ?? "";
  if (!isValidRequestId(requestId)) return reject(400, "REQUEST_ID_INVALID");

  try {
    await db.deviceRequestNonce.create({ data: { deviceId: device.id, requestId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logPayment("warn", "device.replay_rejected", { deviceId: device.id, requestId });
      return reject(409, "REPLAYED_REQUEST");
    }
    throw err;
  }

  return { ok: true, device, requestId };
}

/** Reads a JSON body with a hard size cap (the Content-Length header alone isn't trusted). */
export async function readJsonBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_DEVICE_BODY_BYTES) return reject(413, "PAYLOAD_TOO_LARGE");
  const text = await req.text();
  if (text.length > MAX_DEVICE_BODY_BYTES) return reject(413, "PAYLOAD_TOO_LARGE");
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return reject(400, "INVALID_JSON");
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export { reject as deviceError };
