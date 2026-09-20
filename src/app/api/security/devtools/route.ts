import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Advisory log of "the browser reported DevTools". Written to the existing
 * ActivityLog so admins can review it (Admin → Activity logs, entity type
 * "SecurityEvent").
 *
 * This is CLIENT-REPORTED and therefore spoofable and skippable: a user who
 * blocks the request, or a script that posts fake events, changes nothing
 * about anyone's access. Treat rows as hints, never as evidence, and never
 * make an authorization decision from them. It records who (the
 * authenticated user id from the session — never taken from the body),
 * when, which route, and the detection categories. No cookies, tokens or
 * request bodies beyond that are stored.
 */
const ALLOWED_REASONS = new Set([
  "debugger-pause",
  "console-getter",
  "window-gap",
  "console-timing",
  "timer-stall",
  "tamper",
]);

export async function POST(req: NextRequest) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, isActive: true, isSuspended: true },
  });
  if (!user || !user.isActive || user.isSuspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("write", user.id);
  if (!rl.success) return new NextResponse(null, { status: 429 });

  let body: { reasons?: unknown; path?: unknown };
  try {
    const text = await req.text();
    if (text.length > 2_000) return new NextResponse(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const reasons = Array.isArray(body.reasons)
    ? body.reasons.filter((r): r is string => typeof r === "string" && ALLOWED_REASONS.has(r)).slice(0, 6)
    : [];
  // Path only (no query string, no host) and length-capped.
  const rawPath = typeof body.path === "string" ? body.path : "";
  const path = rawPath.startsWith("/") ? rawPath.split("?")[0]!.slice(0, 200) : "";
  if (reasons.length === 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "SecurityEvent",
        metadata: { kind: "devtools_detected", reasons, path, source: "client-reported" },
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
      },
    });
  } catch {
    // Logging is best-effort; never surface a failure to the client.
  }
  return new NextResponse(null, { status: 204 });
}
