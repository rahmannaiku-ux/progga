import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

/**
 * GET /api/health — used by docker-compose's healthcheck (and any
 * orchestrator/load balancer probe). Deliberately checks a real DB
 * round-trip rather than just returning 200 unconditionally — a
 * process that's "up" but can't reach Postgres should be reported
 * unhealthy, not healthy.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
