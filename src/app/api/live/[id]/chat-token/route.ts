import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { assertCanJoinLiveRoom } from "@/server/live/live-access";
import { resolveLiveApiUser } from "@/server/live/route-auth";
import { getLiveChatService } from "@/server/live/chat/service";
import { isLiveRoomEnabled } from "@/lib/live/flag";

/**
 * POST /api/live/[id]/chat-token
 *
 * The ONLY place a Stream token is issued. Re-runs full authorization
 * on every call (this is deliberately not cached client-side beyond the
 * token's own short TTL -- see stream-provider.ts) so a dropped
 * enrollment, a ban, or a disabled flag takes effect within minutes,
 * not just at initial page load. The Stream API secret never leaves
 * this server (see server/live/chat/stream-provider.ts).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const authResult = await resolveLiveApiUser();
  if (!authResult.ok) return authResult.response;
  const { user } = authResult;

  if (!(await isLiveRoomEnabled(user))) {
    return NextResponse.json({ error: "Live rooms are not available." }, { status: 404 });
  }

  const access = await assertCanJoinLiveRoom(params.id, user);
  if (!access.ok) {
    const status = access.reason === "NOT_FOUND" ? 404 : access.reason === "RATE_LIMITED" ? 429 : 403;
    return NextResponse.json({ error: access.reason }, { status });
  }

  const profileRow = await db.user.findUnique({
    where: { id: user.id },
    select: { firstName: true, lastName: true, avatarUrl: true },
  });
  if (!profileRow) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Only a display first name + last initial -- matches the design
  // review's "first name + last initial" decision, and avoids putting a
  // student's full legal name in front of every classmate.
  const displayName = `${profileRow.firstName} ${profileRow.lastName.charAt(0)}.`.trim();
  const isTeacherRole = user.role === "TEACHER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  try {
    const result = await getLiveChatService().issueToken(access.liveClass.id, {
      id: user.id,
      name: displayName || "Student",
      avatarUrl: profileRow.avatarUrl,
      role: isTeacherRole ? "teacher" : "student",
    });

    return NextResponse.json({
      token: result.token,
      apiKey: result.apiKey,
      userId: result.userId,
      channelType: "liveclass",
      channelId: access.liveClass.id,
      serverNow: new Date().toISOString(),
    });
  } catch (err) {
    // Surfaces the "stream-chat isn't installed yet" case (and any real
    // Stream error) as a clean 503 rather than an unhandled 500 with a
    // stack trace, without ever leaking the secret or vendor internals.
    console.error("Live chat token issuance failed", err);
    return NextResponse.json({ error: "Chat is temporarily unavailable." }, { status: 503 });
  }
}
