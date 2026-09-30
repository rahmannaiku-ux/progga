import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { streamFromDrive } from "@/lib/storage/google-drive";

// Always run per request and never let Next persist anything from this
// route: Drive bytes pass straight through to the browser and are never
// written to this server's disk (no .next/cache entry, no temp file).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Where the "instant" comes from: the student's own browser cache.
 * An Upload's bytes never change (a new file is always a new Upload id
 * and URL), so after the first view the browser keeps its copy for a
 * year and re-shows it with no network at all. `private` means only
 * that user's browser may store it — never a CDN or shared proxy — and
 * the authorization check below still runs on every request that does
 * reach the server.
 */
const BROWSER_CACHE = "private, max-age=31536000, immutable";

/**
 * Server-controlled file serving (storage spec §10) — this is the ONLY
 * way a Google-Drive-backed Upload's bytes ever reach a browser. Drive
 * files are never made public; every request here re-checks that the
 * signed-in user is actually allowed to see this specific file before
 * proxying it from Drive.
 *
 * Nothing is stored locally: bytes stream Drive → this route → the
 * browser, and the browser (not this server) is the cache — see
 * BROWSER_CACHE above.
 *
 * Only handles provider=GOOGLE_DRIVE uploads. UploadThing-backed
 * uploads (including the fallback path) keep using UploadThing's own
 * hosted URL directly and never route through here.
 */
export async function GET(req: NextRequest, { params }: { params: { uploadId: string } }) {
  // Optional/anonymous-safe (AVATAR context is publicly viewable;
  // canAccessUpload below does the real per-context authorization).
  const sessionUser = await getCurrentSessionUser();

  const upload = await db.upload.findUnique({
    where: { id: params.uploadId },
    include: { uploader: { select: { id: true } } },
  });
  if (!upload) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (upload.provider !== "GOOGLE_DRIVE" || !upload.driveFileId) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const viewer = sessionUser ? { id: sessionUser.id, role: sessionUser.role } : null;

  const allowed = await canAccessUpload(upload, viewer);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Unchanged file already in this browser's cache (e.g. after a hard
  // refresh): answer 304 without touching Drive at all.
  const etag = `"${upload.id}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": BROWSER_CACHE } });
  }

  try {
    const range = req.headers.get("range") ?? undefined;
    const { stream, status, contentRange, contentLength } = await streamFromDrive(upload.driveFileId, { range });
    // The googleapis client returns a Node.js Readable (responseType:
    // "stream") — NextResponse's body needs a Web ReadableStream, so
    // this converts explicitly rather than casting past the mismatch.
    const webStream = Readable.toWeb(stream as unknown as Readable) as ReadableStream;
    // The type recorded at upload time, not whatever Drive guesses: with
    // the app-wide `X-Content-Type-Options: nosniff`, a generic type from
    // Drive made browsers refuse to render uploaded avatars as images.
    const contentType = upload.fileType || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${upload.name.replace(/"/g, "")}"`,
      "Cache-Control": BROWSER_CACHE,
      ETag: etag,
      "Accept-Ranges": "bytes",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    else if (status !== 206 && upload.sizeBytes) headers["Content-Length"] = String(upload.sizeBytes);
    if (status === 206 && contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(webStream, { status: status === 206 ? 206 : 200, headers });
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
