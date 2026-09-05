import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { streamFromDrive } from "@/lib/storage/google-drive";

/**
 * Server-controlled file serving (storage spec §10) — this is the ONLY
 * way a Google-Drive-backed Upload's bytes ever reach a browser. Drive
 * files are never made public; every request here re-checks that the
 * signed-in user is actually allowed to see this specific file before
 * proxying it from Drive.
 *
 * Only handles provider=GOOGLE_DRIVE uploads. UploadThing-backed
 * uploads (including the fallback path) keep using UploadThing's own
 * hosted URL directly and never route through here.
 */
export async function GET(req: NextRequest, { params }: { params: { uploadId: string } }) {
  const { userId: clerkId } = auth();

  const upload = await db.upload.findUnique({
    where: { id: params.uploadId },
    include: { uploader: { select: { id: true } } },
  });
  if (!upload) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (upload.provider !== "GOOGLE_DRIVE" || !upload.driveFileId) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const viewer = clerkId
    ? await db.user.findUnique({ where: { clerkId }, select: { id: true, role: true } })
    : null;

  const allowed = await canAccessUpload(upload, viewer);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { stream, mimeType, name } = await streamFromDrive(upload.driveFileId);
    // The googleapis client returns a Node.js Readable (responseType:
    // "stream") — NextResponse's body needs a Web ReadableStream, so
    // this converts explicitly rather than casting past the mismatch.
    const webStream = Readable.toWeb(stream as unknown as Readable) as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        // Avatars change rarely and are re-fetched on every profile/
        // leaderboard/community render across the app — caching keeps
        // this proxy from becoming a Drive-API-call-per-pageview
        // bottleneck (storage spec §11). Non-avatar files (assignments,
        // certificates) are private and per-request, so they aren't cached.
        "Cache-Control":
          upload.context === "AVATAR" ? "private, max-age=3600" : "private, no-store",
      },
    });
  } catch (err) {
    console.error(`Failed to stream upload ${upload.id} from Drive:`, err);
    return NextResponse.json(
      { error: "This file is temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}

async function canAccessUpload(
  upload: { id: string; url: string; context: string; uploaderId: string; uploader: { id: string } },
  viewer: { id: string; role: string } | null
): Promise<boolean> {
  // Profile pictures are shown to other users throughout the app
  // (leaderboard, community, mentor rosters) — inherently public-facing,
  // same as they were as plain UploadThing URLs before.
  if (upload.context === "AVATAR") return true;

  if (!viewer) return false;
  if (viewer.role === "ADMIN" || viewer.role === "SUPER_ADMIN") return true;
  if (upload.uploaderId === viewer.id) return true;

  if (upload.context === "ASSIGNMENT_SUBMISSION") {
    return isTeacherForSubmission(upload, viewer.id);
  }

  // COMMUNITY_IMAGE: visible to any signed-in active user, matching how
  // community content is visible app-wide. CERTIFICATE / OTHER: no
  // further exception beyond owner/admin above.
  if (upload.context === "COMMUNITY_IMAGE") return true;

  return false;
}

/**
 * True if `teacherCandidateId` teaches the SPECIFIC course this
 * upload's own assignment submission belongs to — not just "teaches
 * some course where this student has some submission" (that broader
 * check was an IDOR: it let a teacher of Course A view a student's
 * unrelated submission file from Course B, as long as the student had
 * any submission in Course A too).
 *
 * AssignmentSubmission has no foreign key to Upload — submissions
 * store `fileUrls: String[]`, matched by value — so this has to look
 * up which submission actually references this exact upload's URL
 * first, then check access against THAT submission's real course.
 */
async function isTeacherForSubmission(
  upload: { url: string; uploaderId: string },
  teacherCandidateId: string
): Promise<boolean> {
  const submission = await db.assignmentSubmission.findFirst({
    where: { userId: upload.uploaderId, fileUrls: { has: upload.url } },
    select: {
      assignment: {
        select: {
          lesson: {
            select: {
              group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } },
            },
          },
        },
      },
    },
  });
  const courseId = submission?.assignment.lesson?.group.chapter.module.courseId;
  if (!courseId) return false;

  const teaches = await db.course.findFirst({
    where: { id: courseId, teacherId: teacherCandidateId },
    select: { id: true },
  });
  return Boolean(teaches);
}
