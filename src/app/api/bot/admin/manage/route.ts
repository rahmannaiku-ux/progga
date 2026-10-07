import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botErrorMessage, jsonError, readJsonObject } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { maskPhone } from "@/lib/auth/phone";
import { findUserByIdentifier } from "@/lib/auth/find-user-by-identifier";
import {
  adjustStudentCoinsCore,
  adminSetCourseStatusCore,
  approveCourseTeacherRequestCore,
  createCategoryCore,
  createGlobalAnnouncementCore,
  deleteCourseDiscountCore,
  rejectCourseTeacherRequestCore,
  setCourseDiscountActiveCore,
  setUserRoleCore,
  setUserSuspendedCore,
  toggleStoreItemPublishedCore,
  upsertCourseDiscountCore,
} from "@/server/services/admin-tools";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];
const ROLES: Role[] = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"];

/**
 * Admin tools for the Telegram bot.
 *
 * GET  /api/bot/admin/manage?adminId=&view=user&identifier=   one account (phone or email)
 *                                    view=requests            pending co-mentor requests
 *                                    view=missions            every Mission with status and discount
 *                                    view=store               every Proggy Store item
 * POST /api/bot/admin/manage   { adminId, op, ... }
 *
 * Every change goes through server/services/admin-tools.ts, the code behind the admin
 * panel, so the hierarchy rules (only a super admin touches admins) are the website's.
 * The bot asks for confirmation before each change.
 */
async function adminFrom(id: unknown) {
  const { user, error } = await requireLinkedUser(typeof id === "string" ? id : null);
  if (error) return { admin: null, error };
  if (!ADMIN_ROLES.includes(user!.role)) return { admin: null, error: jsonError("Admin access required.", 403) };
  return { admin: { id: user!.id, role: user!.role }, error: null };
}

async function describeUser(id: string) {
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isSuspended: true,
      createdAt: true,
      heroStats: { select: { xp: true, coinBalance: true, currentStreak: true } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    phone: u.phone ? maskPhone(u.phone) : null,
    role: u.role,
    isActive: u.isActive,
    isSuspended: u.isSuspended,
    createdAt: u.createdAt.toISOString(),
    xp: u.heroStats?.xp ?? 0,
    coinBalance: u.heroStats?.coinBalance ?? 0,
    streakDays: u.heroStats?.currentStreak ?? 0,
    enrollmentCount: u._count.enrollments,
  };
}

export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const params = new URL(req.url).searchParams;
  const { error } = await adminFrom(params.get("adminId"));
  if (error) return error;

  const view = params.get("view");
  if (view === "user") {
    try {
      const found = await findUserByIdentifier(params.get("identifier") ?? "");
      return NextResponse.json(await describeUser(found.id));
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "No such account.", 404);
    }
  }

  if (view === "requests") {
    const rows = await db.courseTeacherRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: {
        id: true,
        roleLabel: true,
        createdAt: true,
        course: { select: { title: true } },
        teacher: { select: { firstName: true, lastName: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        missionTitle: r.course.title,
        mentorName: `${r.teacher.firstName} ${r.teacher.lastName}`.trim(),
        requestedByName: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim(),
        roleLabel: r.roleLabel,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  }

  if (view === "missions") {
    const rows = await db.course.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        status: true,
        isFree: true,
        priceCents: true,
        teacher: { select: { firstName: true, lastName: true } },
        discount: { select: { type: true, percentOff: true, amountOffCents: true, isActive: true } },
        _count: { select: { enrollments: true } },
      },
    });
    return NextResponse.json(
      rows.map(({ teacher, _count, ...c }) => ({
        ...c,
        mentorName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        enrollmentCount: _count.enrollments,
      }))
    );
  }

  if (view === "store") {
    const rows = await db.coinStoreItem.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, type: true, priceCoins: true, isPublished: true },
    });
    return NextResponse.json(rows);
  }

  return jsonError("Unknown view.", 400);
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { admin, error } = await adminFrom(body.adminId);
  if (error) return error;

  const op = str(body.op);
  const rl = await checkRateLimit(op === "announce.global" ? "strict" : "write", `bot-admin:${admin!.id}`);
  if (!rl.success) return jsonError("Too many changes in a minute. Please wait a moment.", 429);

  try {
    switch (op) {
      case "user.role": {
        const role = str(body.role) as Role;
        if (!ROLES.includes(role)) return jsonError("Unknown role.", 400);
        await setUserRoleCore(admin!, str(body.userId), role);
        return NextResponse.json({ ok: true, user: await describeUser(str(body.userId)) });
      }
      case "user.suspend":
        await setUserSuspendedCore(admin!, str(body.userId), body.suspended === true);
        return NextResponse.json({ ok: true, user: await describeUser(str(body.userId)) });
      case "coins.adjust": {
        const amount = typeof body.amount === "number" ? body.amount : NaN;
        const r = await adjustStudentCoinsCore(admin!, str(body.userId), amount, str(body.reason));
        if (!r.ok) return jsonError(r.error, 409);
        return NextResponse.json({ ok: true, user: await describeUser(str(body.userId)) });
      }
      case "announce.global": {
        const r = await createGlobalAnnouncementCore(admin!, str(body.title).slice(0, 120), str(body.body).slice(0, 2000));
        return r.ok ? NextResponse.json({ ok: true }) : jsonError(r.error, 400);
      }
      case "category.create": {
        const r = await createCategoryCore(admin!, { name: str(body.name), isActive: true });
        return r.ok ? NextResponse.json(r) : jsonError(r.error, 409);
      }
      case "mission.status": {
        const status = str(body.status);
        if (status !== "DRAFT" && status !== "PUBLISHED" && status !== "ARCHIVED") return jsonError("Unknown status.", 400);
        await adminSetCourseStatusCore(admin!, str(body.missionId), status);
        return NextResponse.json({ ok: true });
      }
      case "discount.set": {
        const percentOff = typeof body.percentOff === "number" ? body.percentOff : undefined;
        const amountOffCents = typeof body.amountOffCents === "number" ? body.amountOffCents : undefined;
        await upsertCourseDiscountCore(admin!, str(body.missionId), {
          type: percentOff !== undefined ? "PERCENTAGE" : "FIXED",
          percentOff,
          amountOffCents,
          isActive: true,
        });
        return NextResponse.json({ ok: true });
      }
      case "discount.toggle":
        await setCourseDiscountActiveCore(admin!, str(body.missionId), body.active === true);
        return NextResponse.json({ ok: true });
      case "discount.delete":
        await deleteCourseDiscountCore(admin!, str(body.missionId));
        return NextResponse.json({ ok: true });
      case "store.toggle":
        await toggleStoreItemPublishedCore(admin!, str(body.itemId), body.published === true);
        return NextResponse.json({ ok: true });
      case "request.approve": {
        const r = await approveCourseTeacherRequestCore(admin!, str(body.requestId));
        return r.ok ? NextResponse.json(r) : jsonError(r.error, 409);
      }
      case "request.reject": {
        const r = await rejectCourseTeacherRequestCore(admin!, str(body.requestId), str(body.reason));
        return r.ok ? NextResponse.json(r) : jsonError(r.error, 409);
      }
      default:
        return jsonError("Unknown admin action.", 400);
    }
  } catch (err) {
    return jsonError(botErrorMessage(err, "Couldn't make that change."), 409);
  }
}
