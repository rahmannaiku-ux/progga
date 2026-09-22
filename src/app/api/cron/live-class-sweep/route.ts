import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getLiveChatService } from "@/server/live/chat/service";
import { planTransition, type LiveSchedule } from "@/lib/live/state";

/**
 * GET /api/cron/live-class-sweep
 *
 * Same auth pattern as /api/cron/live-class-reminders (CRON_SECRET
 * bearer token, refuses to run unconfigured in production). Two jobs,
 * both best-effort and safe to run repeatedly:
 *
 *  1. Backstop automatic state transitions (SCHEDULED->LIVE->ENDED) for
 *     any LiveClass nobody has loaded recently -- the normal path is
 *     the opportunistic sync in GET /api/live/[id]/state, so this only
 *     matters for classes nobody checked on.
 *  2. Hard-delete the Stream channel for classes that have been ENDED
 *     for 30+ days (per the architecture plan's storage rules -- chat
 *     history isn't meant to live in Stream indefinitely, and nothing
 *     in Postgres depends on the channel still existing once
 *     endSnapshot has captured the teacher-authored notices).
 *
 * Recommended schedule: every 15-30 minutes is plenty for job 1; job 2
 * only needs to run once a day, but running it more often is harmless
 * (there's nothing to delete until 30 days have passed regardless).
 */
const DELETE_AFTER_DAYS = 30;
const SYNC_BATCH_SIZE = 200;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET is not configured — refusing to run /api/cron/live-class-sweep.");
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const now = new Date();
  let synced = 0;
  let syncErrors = 0;

  // Job 1: sync any SCHEDULED/LIVE class whose automatic transition may
  // be overdue. Bounded batch per run rather than "all of them" so this
  // stays cheap even if it's ever run less often than intended.
  const candidates = await db.liveClass.findMany({
    where: { state: { in: ["SCHEDULED", "LIVE"] } },
    include: { lesson: { select: { scheduledStart: true, scheduledEnd: true } } },
    take: SYNC_BATCH_SIZE,
  });

  for (const liveClass of candidates) {
    if (!liveClass.lesson.scheduledStart) continue;
    const schedule: LiveSchedule = {
      scheduledStart: liveClass.lesson.scheduledStart,
      scheduledEnd: liveClass.lesson.scheduledEnd,
    };
    const plan = planTransition("SYNC", schedule, liveClass, now);
    if (plan.kind !== "update") continue;
    try {
      const result = await db.liveClass.updateMany({
        where: { id: liveClass.id, state: plan.expectedState },
        data: plan.patch,
      });
      if (result.count > 0) {
        synced += 1;
        if (plan.patch.state === "ENDED") {
          await db.liveClassAttendance.updateMany({
            where: { liveClassId: liveClass.id, leftAt: null },
            data: { leftAt: plan.patch.actualEnd ?? now },
          });
          await getLiveChatService().closeRoom(liveClass.id).catch(() => {});
        }
      }
    } catch (err) {
      syncErrors += 1;
      console.error("live-class-sweep: sync failed for", liveClass.id, err);
    }
  }

  // Job 2: hard-delete Stream channels for long-ended classes.
  const deleteCutoff = new Date(now.getTime() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const toDelete = await db.liveClass.findMany({
    where: { state: "ENDED", updatedAt: { lt: deleteCutoff }, chatProvider: { not: "deleted" } },
    select: { id: true },
    take: SYNC_BATCH_SIZE,
  });

  let deleted = 0;
  let deleteErrors = 0;
  const chatService = getLiveChatService();
  for (const { id } of toDelete) {
    try {
      await chatService.deleteRoom(id);
      await db.liveClass.update({ where: { id }, data: { chatProvider: "deleted" } });
      deleted += 1;
    } catch (err) {
      deleteErrors += 1;
      console.error("live-class-sweep: channel delete failed for", id, err);
    }
  }

  return NextResponse.json({
    synced,
    syncErrors,
    deleted,
    deleteErrors,
    checkedForSync: candidates.length,
    checkedForDelete: toDelete.length,
  });
}
