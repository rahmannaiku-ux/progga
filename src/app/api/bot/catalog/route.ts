import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { catalogCardSelect, toCatalogCard } from "@/lib/bot-api/catalog";
import { db } from "@/lib/db/client";

const PAGE_SIZE = 6;

/**
 * GET /api/bot/catalog?userId=...&q=...&page=1
 * Published Missions a hero can browse and search, with the price they would pay today
 * (admin discounts applied) and whether they are already enrolled.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const params = new URL(req.url).searchParams;
  const { user, error } = await requireLinkedUser(params.get("userId"));
  if (error) return error;

  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(50, Math.trunc(Number(params.get("page") ?? 1)) || 1));

  const where = {
    status: "PUBLISHED" as const,
    ...(q
      ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { subtitle: { contains: q, mode: "insensitive" as const } }] }
      : {}),
  };

  const [total, courses, enrollments] = await Promise.all([
    db.course.count({ where }),
    db.course.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: catalogCardSelect,
    }),
    db.enrollment.findMany({ where: { userId: user!.id }, select: { courseId: true, status: true } }),
  ]);
  const enrolled = new Set(enrollments.filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED").map((e) => e.courseId));

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    missions: courses.map((c) => toCatalogCard(c, enrolled.has(c.id))),
  });
}
