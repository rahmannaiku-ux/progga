import { NextResponse } from "next/server";
import { requireLinkedUser } from "@/lib/auth/bot-auth";
import { studentNeedsProfileStep } from "@/lib/auth/profile-gate";
import { db } from "@/lib/db/client";

/**
 * Small shared pieces for the Telegram bot's /api/bot/* routes, so each route stays
 * a thin layer over the website's own services.
 */

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}

/** Reads a JSON body, or returns null when it is missing or not an object. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * A linked, active hero whose profile is complete: the same bar the website sets
 * (requireCompletedProfile) for anything that changes data.
 */
export async function requireLinkedHeroForWrite(userId: string | null) {
  const { user, error } = await requireLinkedUser(userId);
  if (error) return { user: null, error };
  if (studentNeedsProfileStep(user!)) {
    return { user: null, error: jsonError("Please complete your profile on Proggaa first.", 409, "PROFILE_INCOMPLETE") };
  }
  return { user: user!, error: null };
}

/** The hero's enrolments that give access to a Mission's content. */
export async function activeEnrolledCourseIds(userId: string, courseIds: string[]): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set();
  const rows = await db.enrollment.findMany({
    where: { userId, courseId: { in: courseIds }, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  return new Set(rows.map((r) => r.courseId));
}

/**
 * Whether a hero may open a Patrol: an active enrolment in its Mission, or the Patrol
 * is a free preview, or it was bought individually as a Proggy Store "Exclusive Class".
 * (Same three ways the website's patrol page lets someone in.)
 */
export async function patrolAccessFor(
  userId: string,
  patrols: { id: string; isPreview: boolean; courseId: string }[]
): Promise<Map<string, boolean>> {
  const enrolled = await activeEnrolledCourseIds(userId, [...new Set(patrols.map((p) => p.courseId))]);
  const needPurchaseCheck = patrols.filter((p) => !enrolled.has(p.courseId) && !p.isPreview).map((p) => p.id);
  const purchased = needPurchaseCheck.length
    ? new Set(
        (
          await db.coinPurchase.findMany({
            where: { userId, item: { lessonId: { in: needPurchaseCheck } } },
            select: { item: { select: { lessonId: true } } },
          })
        ).map((r) => r.item.lessonId)
      )
    : new Set<string | null>();

  return new Map(patrols.map((p) => [p.id, enrolled.has(p.courseId) || p.isPreview || purchased.has(p.id)]));
}

export function patrolPath(ids: { missionId: string; operationId: string; chapterId: string; groupId: string; patrolId: string }) {
  return `/missions/${ids.missionId}/operations/${ids.operationId}/chapters/${ids.chapterId}/groups/${ids.groupId}/patrols/${ids.patrolId}`;
}

/**
 * The message to send back when a shared service threw: its own sentences are written
 * for people, but a database error (say, an id that was just deleted) is not.
 */
export function botErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  if (err.name.startsWith("PrismaClient") || err.constructor.name.startsWith("PrismaClient")) {
    return "That item no longer exists or was changed. Please refresh and try again.";
  }
  return err.message;
}
