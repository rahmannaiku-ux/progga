import { NextResponse } from "next/server";
import { constantTimeEquals } from "@/lib/auth/bot-auth";
import { runBirthdayJob } from "@/server/services/birthday";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/birthday-rewards — grants today's (Asia/Dhaka) birthday
 * rewards, expires birthday coins that reached their 30 days, queues the
 * "expires soon" reminders and sends/retries phone (Web Push) delivery.
 * Every step is idempotent, so running it often, twice at once, or after a
 * failed run is safe. Schedule it hourly (at minimum once shortly after
 * 00:00 Dhaka = 18:00 UTC). Same CRON_SECRET fail-closed pattern as the
 * other cron routes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET is not configured — refusing to run /api/cron/birthday-rewards.");
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else if (!constantTimeEquals(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runBirthdayJob(new Date());
  return NextResponse.json(result);
}
