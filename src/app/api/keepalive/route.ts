import { after, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { runDueJobs } from "@/server/services/scheduled-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEARTBEAT_ID = "keepalive";
const WRITE_EVERY_MS = 60 * 60 * 1000;

/**
 * GET /api/keepalive — proves the database is reachable and in use.
 *
 * Called by the daily Vercel cron (vercel.json) and by the GitHub Actions
 * workflow .github/workflows/keepalive.yml, so the free Supabase project
 * always sees real reads and writes even in a quiet week: Supabase pauses
 * inactive free projects, and one left paused for 90 days can no longer be
 * restored. The GitHub job also calls it every few minutes during the day,
 * which keeps this function and the database connection warm.
 *
 * Public and cheap: one indexed read, and the heartbeat row is rewritten at
 * most once an hour however often (or by whom) this is called.
 *
 * After answering, it also starts whichever scheduled jobs are due (live-class and exam
 * reminders, payment expiry...; see server/services/scheduled-jobs.ts). Each runs at most once
 * per its own interval, however often this is called.
 */
export async function GET() {
  const started = Date.now();
  try {
    const beat = await db.heartbeat.findUnique({ where: { id: HEARTBEAT_ID }, select: { pingedAt: true } });
    const wrote = !beat || beat.pingedAt.getTime() < Date.now() - WRITE_EVERY_MS;
    if (wrote) {
      const now = new Date();
      await db.heartbeat.upsert({
        where: { id: HEARTBEAT_ID },
        create: { id: HEARTBEAT_ID, pingedAt: now },
        update: { pingedAt: now },
      });
    }
    after(() => runDueJobs().then((ran) => {
      if (Object.keys(ran).length > 0) console.warn("[keepalive] scheduled jobs", JSON.stringify(ran));
    }));
    return NextResponse.json(
      { status: "ok", db: "ok", wrote, ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("keepalive: database check failed", err);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
