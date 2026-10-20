import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { isCourseMentor } from "@/lib/auth/course-access";
import { formatDhakaDateTime } from "@/lib/timezone";

/** Quotes a CSV cell, and defuses text a spreadsheet would run as a formula. */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * GET /api/mentor/assessments/[assessmentId]/results
 * Every finished attempt of one exam as a CSV download, for the mentors
 * of its mission and admins.
 */
export async function GET(_req: Request, props: { params: Promise<{ assessmentId: string }> }) {
  const params = await props.params;
  const user = await getCurrentActiveSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const assessment = await db.assessment.findUnique({
    where: { id: params.assessmentId },
    select: {
      id: true,
      title: true,
      courseId: true,
      chapter: { select: { module: { select: { courseId: true } } } },
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
    },
  });
  const courseId =
    assessment?.courseId ?? assessment?.chapter?.module.courseId ?? assessment?.lesson?.group.chapter.module.courseId;
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const allowed = isAdmin || (user.role === "TEACHER" && courseId && (await isCourseMentor(courseId, user.id)));
  // Same answer for "no such exam" and "not yours".
  if (!assessment || !allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const attempts = await db.assessmentAttempt.findMany({
    where: { assessmentId: assessment.id, status: { in: ["SUBMITTED", "GRADED"] } },
    orderBy: [{ user: { firstName: "asc" } }, { attemptNumber: "asc" }],
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const header = [
    "Student",
    "Attempt",
    "Status",
    "Score",
    "Out of",
    "Percent",
    "Result",
    "Time taken (seconds)",
    "Submitted (Dhaka time)",
    "Times left the page",
    "Integrity",
    "Disqualified",
  ];
  const rows = attempts.map((a) => [
    `${a.user.firstName} ${a.user.lastName}`.trim(),
    a.attemptNumber,
    a.status === "SUBMITTED" ? "Awaiting review" : "Graded",
    a.rawScore,
    a.maxScore,
    a.percentage == null ? "" : Math.round(a.percentage),
    a.isPassed == null ? "Pending" : a.isPassed ? "Passed" : "Failed",
    a.timeSpentSec,
    a.submittedAt ? formatDhakaDateTime(a.submittedAt) : "",
    a.tabSwitchCount,
    a.riskLevel,
    a.wasDisqualified ? "Yes" : "No",
  ]);

  // The BOM makes Excel read Bangla names as UTF-8.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const filename = `${assessment.title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam"}-results.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
