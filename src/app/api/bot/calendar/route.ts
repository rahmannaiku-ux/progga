import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getStudentCalendarItems } from "@/server/services/calendar";

const LOOKBACK_MS = 60 * 60 * 1000;
const MAX_ITEMS = 20;

/**
 * GET /api/bot/calendar?userId=...
 * The hero's upcoming calendar (events, live classes, challenge deadlines), from the
 * same service the website's Calendar page uses, soonest first.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const since = Date.now() - LOOKBACK_MS;
  const items = (await getStudentCalendarItems(user!.id))
    .filter((i) => (i.endAt ?? i.startAt).getTime() >= since)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, MAX_ITEMS);

  return NextResponse.json(
    items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      description: i.description,
      startAt: i.startAt,
      endAt: i.endAt,
      path: i.href && i.href.startsWith("/") && !i.href.startsWith("//") ? i.href : null,
      missionTitle: i.courseTitle,
    }))
  );
}
