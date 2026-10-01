import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject, requireLinkedHeroForWrite } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { enrollInFreeCourse } from "@/server/services/enrollment";

/**
 * POST /api/bot/missions/:id/enroll   { userId }
 * Enrols a hero in a FREE Mission through the same service as the website's Enroll
 * button. Paid Missions go through /checkout instead.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedHeroForWrite(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  const rl = await checkRateLimit("strict", `bot-enroll:${user!.id}`);
  if (!rl.success) return jsonError("Too many attempts. Please wait a moment.", 429);

  try {
    await enrollInFreeCourse(user!, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // The service's messages are written for people (paused, not free, not available).
    return jsonError(err instanceof Error ? err.message : "Couldn't enrol you.", 409);
  }
}
