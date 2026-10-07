import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { updateHeadlineAndBio } from "@/server/services/profile-service";

/**
 * GET  /api/bot/profile?userId=      the person's headline and bio
 * POST /api/bot/profile  { userId, headline?, bio? }
 *
 * The same "about me" fields as the website's /profile page, saved by the same
 * service. Name, phone, email and the student details stay on the website, where
 * they are verified.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;
  const row = await db.user.findUnique({ where: { id: user!.id }, select: { headline: true, bio: true } });
  return NextResponse.json({ headline: row?.headline ?? null, bio: row?.bio ?? null });
}

export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedUser(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  const headline = typeof body.headline === "string" ? body.headline : undefined;
  const bio = typeof body.bio === "string" ? body.bio : undefined;
  if (headline === undefined && bio === undefined) return jsonError("Nothing to change.", 400);

  const rl = await checkRateLimit("write", `bot-profile:${user!.id}`);
  if (!rl.success) return jsonError("Too many changes in a minute. Please wait a moment.", 429);

  await updateHeadlineAndBio(user!.id, { headline, bio });
  revalidatePath("/profile");
  return NextResponse.json({ ok: true });
}
