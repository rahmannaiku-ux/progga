import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { assertCanJoinLiveRoom } from "@/server/live/live-access";
import { resolveLiveApiUser } from "@/server/live/route-auth";
import { isLiveRoomEnabled } from "@/lib/live/flag";

/**
 * POST /api/live/[id]/attendance   body: { action: "join" | "leave" }
 *
 * Attendance means presence in the room, not a click on the YouTube
 * player -- the Live Room UI calls "join" once the room has actually
 * mounted and "leave" on unmount/page hide. Must be safe to call from
 * `navigator.sendBeacon` on page unload (which cannot set an
 * Authorization header or read the response), so authorization here
 * relies entirely on the browser's existing Clerk session cookie, same
 * as every other same-origin fetch in this app -- no bearer token is
 * needed or accepted.
 *
 * Race safety: two overlapping "join" calls for the same student (a
 * double-mount in React StrictMode, a fast reconnect racing the
 * original tab) must not create two OPEN sessions. The Postgres partial
 * unique index `(liveClassId, userId) WHERE leftAt IS NULL` (see
 * prisma/manual-migrations/live_room_foundation.sql) makes the DB the
 * source of truth for this: on a unique violation (P2002) we reuse the
 * existing open session and bump reconnectCount instead of erroring.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authResult = await resolveLiveApiUser();
  if (!authResult.ok) return authResult.response;
  const { user } = authResult;

  if (!(await isLiveRoomEnabled(user))) {
    return NextResponse.json({ error: "Live rooms are not available." }, { status: 404 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "join") {
    const access = await assertCanJoinLiveRoom(params.id, user);
    if (!access.ok) {
      const status = access.reason === "NOT_FOUND" ? 404 : access.reason === "RATE_LIMITED" ? 429 : 403;
      return NextResponse.json({ error: access.reason }, { status });
    }

    try {
      const session = await db.liveClassAttendance.create({
        data: { liveClassId: params.id, userId: user.id },
      });
      return NextResponse.json({ sessionId: session.id, reconnected: false });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        // An open session already exists (concurrent join or a genuine
        // reconnect) -- reuse it rather than creating a second one.
        const existing = await db.liveClassAttendance.findFirst({
          where: { liveClassId: params.id, userId: user.id, leftAt: null },
          orderBy: { joinedAt: "desc" },
        });
        if (existing) {
          await db.liveClassAttendance.update({
            where: { id: existing.id },
            data: { reconnectCount: { increment: 1 } },
          });
          return NextResponse.json({ sessionId: existing.id, reconnected: true });
        }
      }
      throw err;
    }
  }

  if (body.action === "leave") {
    // Deliberately does not re-run assertCanJoinLiveRoom -- a student
    // whose enrollment just changed, or who is leaving as the class
    // ends, must still be able to close out their OWN open session.
    // updateMany with leftAt: null as a filter is what makes this safe:
    // it closes at most one row and is a no-op if already closed
    // (e.g. the class-end cleanup in live-class-actions.ts got there
    // first), so a late/duplicate "leave" beacon can't do anything odd.
    await db.liveClassAttendance.updateMany({
      where: { liveClassId: params.id, userId: user.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be 'join' or 'leave'." }, { status: 400 });
}
