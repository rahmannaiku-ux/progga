import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { catalogCardSelect, toCatalogCard } from "@/lib/bot-api/catalog";
import { jsonError } from "@/lib/bot-api/helpers";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/catalog/:id?userId=...
 * One published Mission with its description, today's price, whether the hero is
 * enrolled, and any payment of theirs for it that is still open.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const course = await db.course.findFirst({
    where: { id: params.id, status: "PUBLISHED" },
    select: { ...catalogCardSelect, description: true },
  });
  if (!course) return jsonError("Mission not found.", 404);

  const [enrollment, openPayment] = await Promise.all([
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user!.id, courseId: course.id } },
      select: { status: true },
    }),
    db.payment.findFirst({
      where: { userId: user!.id, courseId: course.id, status: { in: ["PENDING", "AWAITING_VERIFICATION"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    }),
  ]);
  const enrolled = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";

  const { description, ...card } = course;
  return NextResponse.json({
    ...toCatalogCard(card, enrolled),
    description: description.slice(0, 1500),
    openPayment,
  });
}
