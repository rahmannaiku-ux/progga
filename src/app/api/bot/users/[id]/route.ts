import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botUserSelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/users/:id
 * This is the endpoint the bot's ProggaaUserService.getRole() calls on
 * every single update — it must always reflect the current role, never
 * a cached one (a website-side role change should apply on the bot
 * immediately, matching src/bot/middleware/auth.ts's own contract).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(params.id);
  if (error) return error;

  const full = await db.user.findUnique({ where: { id: user!.id }, select: botUserSelect });
  return NextResponse.json(full);
}
