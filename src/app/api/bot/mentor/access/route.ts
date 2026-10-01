import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject } from "@/lib/bot-api/helpers";
import { grantCourseAccessCore } from "@/lib/enrollment/grant-access";
import { issueCertificateManuallyCore } from "@/lib/certificate/manual-issue";
import { checkRateLimit } from "@/lib/rate-limit";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];

/**
 * POST /api/bot/mentor/access   { mentorId, action: "grant" | "medal", identifier, missionId }
 *
 * "Grant access" and "Issue medal" from the mentor menu, through the website's own cores
 * (grantCourseAccessCore, issueCertificateManuallyCore). A mentor can only act on a Mission
 * they teach (an admin on any); the cores enforce that with requireCourseOwnerId. The bot
 * asks for confirmation before calling this. `identifier` is the hero's email or phone.
 */
export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user: mentor, error } = await requireLinkedUser(typeof body.mentorId === "string" ? body.mentorId : null);
  if (error) return error;
  if (!MENTOR_ROLES.includes(mentor!.role)) return jsonError("Mentor access required.", 403);

  const action = body.action;
  const identifier = typeof body.identifier === "string" ? body.identifier.trim().slice(0, 120) : "";
  const missionId = typeof body.missionId === "string" ? body.missionId : "";
  if ((action !== "grant" && action !== "medal") || !identifier || !missionId) {
    return jsonError("Action, hero and Mission are all required.", 400);
  }

  const rl = await checkRateLimit("strict", `bot-mentor-access:${mentor!.id}`);
  if (!rl.success) return jsonError("Too many requests. Please wait a moment.", 429);

  const args = {
    email: identifier,
    courseId: missionId,
    requireCourseOwnerId: mentor!.role === "TEACHER" ? mentor!.id : undefined,
  };

  if (action === "medal") {
    const result = await issueCertificateManuallyCore({ issuerId: mentor!.id, ...args });
    return result.ok ? NextResponse.json(result) : jsonError(result.error, 409);
  }

  const result = await grantCourseAccessCore({ granterId: mentor!.id, ...args });
  return result.ok ? NextResponse.json(result) : jsonError(result.error, 409);
}
