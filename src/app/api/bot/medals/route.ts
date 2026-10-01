import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/medals?userId=...
 * The Medals (certificates) this hero has earned. The PDF is opened on Proggaa; the bot
 * gets the public verification path so a Medal can be shared and checked.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const medals = await db.certificate.findMany({
    where: { userId: user!.id, status: "ISSUED" },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: { id: true, certificateNo: true, issuedAt: true, course: { select: { id: true, title: true } } },
  });

  return NextResponse.json(
    medals.map((m) => ({
      id: m.id,
      missionId: m.course.id,
      missionTitle: m.course.title,
      issuedAt: m.issuedAt,
      verifyPath: `/certificates/verify/${encodeURIComponent(m.certificateNo)}`,
    }))
  );
}
