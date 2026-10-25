import { NextResponse } from "next/server";
import { constantTimeEquals } from "@/lib/auth/bot-auth";
import { runBirthdayJob } from "@/server/services/birthday";
import { purgeDueAccountDeletions } from "@/server/services/account-deletion";

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
 *
 * The same daily run also erases accounts whose 30-day deletion period has ended
 * (account-deletion.ts), since the plan allows only a couple of Vercel crons.
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

  const now = new Date();
  const result = await runBirthdayJob(now);
  const accountsErased = await purgeDueAccountDeletions(now).catch((err) => {
    console.error("[cron] account deletion sweep failed", err);
    return -1;
  });
  return NextResponse.json({ ...result, accountsErased });
}
