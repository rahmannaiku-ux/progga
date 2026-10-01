import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { db } from "@/lib/db/client";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { streamFromDrive } from "@/lib/storage/google-drive";
import { googleDownloadUrl } from "@/lib/google-embed";
import {
  asciiFileName,
  canShowInline,
  decideResourceAccess,
  downloadFileName,
  type ResourceAccessMode,
} from "@/lib/resource-download";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Hosts a stored upload URL may live on. Anything else is never fetched. */
const ALLOWED_FILE_HOSTS = new Set(["utfs.io"]);

/**
 * Serves a lesson file, in one of two modes:
 *
 *  - default: one-click download (`Content-Disposition: attachment`). Needs the
 *    file's "downloadable" switch to be on. Each student download is counted.
 *  - `?view=1`: opens the file in the browser (PDFs and plain images only; any
 *    other type is still sent as a download). Needs only lesson access.
 *
 * Both go through the server, so the raw storage URL is never put in the page
 * for uploaded files, and every request re-checks that the viewer is signed in
 * and may open the lesson (enrolled, preview lesson, coin-store unlock, or the
 * mission's team / an admin).
 *
 * Google Drive / Docs / Sheets / Slides links are never fetched by this server.
 * When their switch is on, the request is counted and redirected to Google's
 * own download address, which is built from the document id alone.
 */
export async function GET(req: NextRequest, { params }: { params: { resourceId: string } }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.resourceId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const mode: ResourceAccessMode = req.nextUrl.searchParams.get("view") === "1" ? "view" : "download";

  const user = await getCurrentActiveSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to open this file." }, { status: 401 });

  const resource = await db.lessonResource.findUnique({
    where: { id: params.resourceId },
    select: {
      title: true,
      url: true,
      type: true,
      downloadable: true,
      lesson: {
        select: {
          id: true,
          isPreview: true,
          group: {
            select: {
              chapter: {
                select: {
                  module: { select: { courseId: true, course: { select: { teacherId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!resource) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const isLink = resource.type === "LINK";
  // Links open from the page itself; only their Google download goes through here.
  if (isLink && mode === "view") return NextResponse.json({ error: "File not found." }, { status: 404 });

  const courseId = resource.lesson.group.chapter.module.courseId;
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isTeam =
    isAdmin ||
    resource.lesson.group.chapter.module.course.teacherId === user.id ||
    Boolean(await db.courseTeacher.findFirst({ where: { courseId, teacherId: user.id }, select: { id: true } }));

  const [enrollment, unlocked] = isTeam
    ? [null, null]
    : await Promise.all([
        db.enrollment.findUnique({
          where: { userId_courseId: { userId: user.id, courseId } },
          select: { id: true },
        }),
        db.coinPurchase.findFirst({
          where: { userId: user.id, item: { lessonId: resource.lesson.id } },
          select: { id: true },
        }),
      ]);

  const access = decideResourceAccess({
    isTeam,
    downloadable: resource.downloadable,
    mode,
    enrolled: Boolean(enrollment),
    isPreview: resource.lesson.isPreview,
    unlocked: Boolean(unlocked),
  });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (mode === "download" && !isTeam) {
    // A failed counter must never block the student's download.
    await db.lessonResource
      .update({ where: { id: params.resourceId }, data: { downloadCount: { increment: 1 } } })
      .catch((err) => console.error("Could not count a resource download:", err));
  }

  if (isLink) {
    const target = googleDownloadUrl(resource.url);
    if (!target) return NextResponse.json({ error: "This link can't be downloaded." }, { status: 404 });
    return NextResponse.redirect(target, 302);
  }

  // Only files the app itself stored are ever served.
  const upload = await db.upload.findUnique({
    where: { url: resource.url },
    select: { name: true, fileType: true, provider: true, driveFileId: true },
  });
  if (!upload) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const fileName = downloadFileName(resource.title, upload.name);
  const inline = mode === "view" && canShowInline(upload.fileType);
  const headers: Record<string, string> = {
    "Content-Type": upload.fileType || "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  try {
    if (upload.provider === "GOOGLE_DRIVE" && upload.driveFileId) {
      const { stream, contentLength } = await streamFromDrive(upload.driveFileId);
      if (contentLength) headers["Content-Length"] = contentLength;
      return new NextResponse(Readable.toWeb(stream as unknown as Readable) as ReadableStream, { headers });
    }

    const remote = new URL(resource.url);
    if (remote.protocol !== "https:" || !ALLOWED_FILE_HOSTS.has(remote.hostname)) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    const res = await fetch(remote, { cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`Upstream responded ${res.status}`);
    const length = res.headers.get("content-length");
    if (length) headers["Content-Length"] = length;
    return new NextResponse(res.body, { headers });
  } catch (err) {
    console.error(`Failed to stream lesson resource ${params.resourceId}:`, err);
    return NextResponse.json({ error: "This file is temporarily unavailable. Try again shortly." }, { status: 502 });
  }
}
