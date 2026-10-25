import { db } from "@/lib/db/client";

/**
 * Runs the /api/cron/* jobs on their own schedules from one frequent caller.
 *
 * The Vercel plan allows only daily crons, so live-class reminders, exam and challenge
 * reminders, the live-class state sweep and payment expiry had no scheduler at all. The
 * GitHub Actions keep-alive calls /api/keepalive every 10 minutes during the day; that route
 * calls runDueJobs, which starts each job whose interval has passed. Every job is idempotent,
 * and each interval is claimed with one conditional update (Heartbeat row "job:<name>"), so
 * overlapping callers never run the same job twice.
 */

type Job = { name: string; everyMs: number; load: () => Promise<{ GET: (req: Request) => Promise<Response> }> };

const MIN = 60 * 1000;

const JOBS: Job[] = [
  { name: "live-class-reminders", everyMs: 5 * MIN, load: () => import("@/app/api/cron/live-class-reminders/route") },
  { name: "live-class-sweep", everyMs: 10 * MIN, load: () => import("@/app/api/cron/live-class-sweep/route") },
  { name: "notification-reminders", everyMs: 15 * MIN, load: () => import("@/app/api/cron/notification-reminders/route") },
  { name: "deliver-webhooks", everyMs: 10 * MIN, load: () => import("@/app/api/cron/deliver-webhooks/route") },
  { name: "expire-payments", everyMs: 60 * MIN, load: () => import("@/app/api/cron/expire-payments/route") },
  { name: "birthday-rewards", everyMs: 60 * MIN, load: () => import("@/app/api/cron/birthday-rewards/route") },
  { name: "prune-device-nonces", everyMs: 24 * 60 * MIN, load: () => import("@/app/api/cron/prune-device-nonces/route") },
];

/** Claims a job's slot: true for exactly one caller once `everyMs` has passed since the last run. */
async function claim(name: string, everyMs: number, now: Date): Promise<boolean> {
  const id = `job:${name}`;
  await db.heartbeat.upsert({ where: { id }, create: { id, pingedAt: new Date(0) }, update: {} });
  const claimed = await db.heartbeat.updateMany({
    where: { id, pingedAt: { lte: new Date(now.getTime() - everyMs) } },
    data: { pingedAt: now },
  });
  return claimed.count === 1;
}

/** Starts every job that is due. Never throws; returns what ran and how each answered. */
export async function runDueJobs(now = new Date()): Promise<Record<string, number | string>> {
  const secret = process.env.CRON_SECRET;
  const results: Record<string, number | string> = {};
  for (const job of JOBS) {
    try {
      if (!(await claim(job.name, job.everyMs, now))) continue;
      const { GET } = await job.load();
      const res = await GET(
        new Request(`https://internal/api/cron/${job.name}`, {
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        })
      );
      results[job.name] = res.status;
    } catch (err) {
      console.error(`[scheduled-jobs] ${job.name} failed`, err);
      results[job.name] = "error";
    }
  }
  return results;
}
