import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";

export async function GET() {
  // PHASE 5: migrated off Clerk — identity now comes from the custom
  // session via getCurrentActiveSessionUser (already checks
  // isActive/isSuspended), role checked here as before.
  const admin = await getCurrentActiveSessionUser();
  if (!admin || (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const rl = await checkRateLimit("strict", admin.id);
  if (!rl.success) {
    return new NextResponse("Too many export requests — please wait a moment.", { status: 429 });
  }

  const [users, courses, enrollments, certificates, categories] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isSuspended: true,
        createdAt: true,
      },
    }),
    db.course.findMany({
      select: { id: true, title: true, slug: true, status: true, teacherId: true, createdAt: true },
    }),
    db.enrollment.findMany({
      select: { id: true, userId: true, courseId: true, status: true, progressPct: true, enrolledAt: true },
    }),
    db.certificate.findMany({
      select: { id: true, userId: true, courseId: true, status: true, certificateNo: true, issuedAt: true },
    }),
    db.category.findMany({ select: { id: true, name: true, slug: true } }),
  ]);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    note: "Read-only export for reporting/archival. This is not a full database backup — for disaster recovery, use your Postgres provider's native pg_dump/point-in-time-recovery tooling against DATABASE_URL.",
    users,
    courses,
    enrollments,
    certificates,
    categories,
  };

  await db.activityLog.create({
    data: { userId: admin.id, action: "CREATE", entityType: "DataExport" },
  });

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="proggaa-export-${Date.now()}.json"`,
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}
