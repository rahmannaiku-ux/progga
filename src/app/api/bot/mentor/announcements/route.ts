import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject } from "@/lib/bot-api/helpers";
import { postMissionAnnouncement } from "@/server/services/mission-announcements";
import { checkRateLimit } from "@/lib/rate-limit";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];

/**
 * POST /api/bot/mentor/announcements   { mentorId, missionId, title, body }
 * A mentor announces to one of their own Missions (an admin to any): the website's own
 * postMissionAnnouncement stores it and notifies every enrolled hero. The bot asks for
 * confirmation before calling this.
 */
export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user: mentor, error } = await requireLinkedUser(typeof body.mentorId === "string" ? body.mentorId : null);
  if (error) return error;
  if (!MENTOR_ROLES.includes(mentor!.role)) return jsonError("Mentor access required.", 403);

  const missionId = typeof body.missionId === "string" ? body.missionId : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
  if (!missionId || !title || !text) return jsonError("Mission, title, and message are all required.", 400);

  const rl = await checkRateLimit("strict", `bot-announce:${mentor!.id}`);
  if (!rl.success) return jsonError("Too many announcements in a minute. Please wait.", 429);

  try {
    await postMissionAnnouncement(mentor!, missionId, title, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Couldn't post the announcement.", 403);
  }
}
