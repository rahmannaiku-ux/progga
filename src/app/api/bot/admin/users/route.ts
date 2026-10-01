import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botUserSelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];
const ROLES = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"] as const;

/** GET /api/bot/admin/users?userId=<admin>&role=STUDENT — newest accounts first, capped at 50. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const params = new URL(req.url).searchParams;
  const { user, error } = await requireLinkedUser(params.get("userId"));
  if (error) return error;
  if (!ADMIN_ROLES.includes(user!.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const role = params.get("role");
  if (role && !(ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }

  const users = await db.user.findMany({
    where: { isActive: true, ...(role ? { role: role as (typeof ROLES)[number] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { ...botUserSelect, heroStats: { select: { xp: true, currentStreak: true } } },
  });
  return NextResponse.json(
    users.map(({ heroStats, ...u }) => ({ ...u, xp: heroStats?.xp ?? 0, streakDays: heroStats?.currentStreak ?? 0 }))
  );
}
