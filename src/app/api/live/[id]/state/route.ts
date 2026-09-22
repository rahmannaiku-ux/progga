import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { planTransition, resolveLiveClassState, type LiveSchedule } from "@/lib/live/state";
import { resolveLiveApiUser } from "@/server/live/route-auth";
import { isLiveRoomEnabled } from "@/lib/live/flag";

/**
 * GET /api/live/[id]/state
 *
 * Lightweight polling target for the waiting room (SCHEDULED classes
 * only, 30-60s + jitter, per the architecture plan) and for the client
 * to compute clock skew (`serverNow`) without opening a Stream
 * connection. No Stream call here at all -- this only reads Proggaa's
 * own LiveClass + Lesson schedule and applies the pure state resolver.
 *
 * Also opportunistically persists an automatic SCHEDULED->LIVE or
 * LIVE->ENDED transition that the resolver detects but the DB row
 * hasn't caught up to yet (the "SYNC" plan from lib/live/state.ts) --
 * this is what makes automatic transitions actually happen without
 * depending on the sweep cron running promptly.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const authResult = await resolveLiveApiUser();
  if (!authResult.ok) return authResult.response;
  const { user } = authResult;

  if (!(await isLiveRoomEnabled(user))) {
    return NextResponse.json({ error: "Live rooms are not available." }, { status: 404 });
  }

  const liveClass = await db.liveClass.findUnique({
    where: { id: params.id },
    include: { lesson: { select: { scheduledStart: true, scheduledEnd: true, title: true } } },
  });
  if (!liveClass) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const schedule: LiveSchedule = {
    scheduledStart: liveClass.lesson.scheduledStart!,
    scheduledEnd: liveClass.lesson.scheduledEnd,
  };
  const now = new Date();
  const resolved = resolveLiveClassState(schedule, liveClass, now);

  if (resolved !== liveClass.state) {
    const plan = planTransition("SYNC", schedule, liveClass, now);
    if (plan.kind === "update") {
      await db.liveClass.updateMany({
        where: { id: liveClass.id, state: plan.expectedState },
        data: plan.patch,
      });
      // Not re-read: whichever request wins the race, the NEXT poll
      // reflects it. This response already returns `resolved`, which is
      // correct regardless of which request's write actually lands.
    }
  }

  return NextResponse.json({
    id: liveClass.id,
    state: resolved,
    chatEnabled: liveClass.chatEnabled,
    title: liveClass.lesson.title,
    scheduledStart: schedule.scheduledStart.toISOString(),
    scheduledEnd: schedule.scheduledEnd?.toISOString() ?? null,
    serverNow: now.toISOString(),
  });
}
