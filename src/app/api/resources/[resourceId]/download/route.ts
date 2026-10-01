import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { db } from "@/lib/db/client";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { streamFromDrive } from "@/lib/storage/google-drive";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Hosts a stored upload URL may live on. Anything else is never fetched. */
const ALLOWED_FILE_HOSTS = new Set(["utfs.io"]);

/**
 * One-click download of a lesson file.
 *
 * Streams the file back with `Content-Disposition: attachment`, so the browser
 * saves it immediately instead of opening a viewer. Three checks run on every
 * request, all on the server: the resource's `downloadable` switch is on, the
 * file is a stored upload (never an external link), and the viewer may open the
 * lesson (enrolled, preview lesson, coin-store unlock, or the mission's
 * team / an admin).
 */
export async function GET(_req: NextRequest, { params }: { params: { resourceId: string } }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.resourceId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const user = await getCurrentActiveSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to download this file." }, { status: 401 });

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
  if (!resource || resource.type === "LINK") {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const courseId = resource.lesson.group.chapter.module.courseId;
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isTeam =
    isAdmin ||
    resource.lesson.group.chapter.module.course.teacherId === user.id ||
    Boolean(
      await db.courseTeacher.findFirst({ where: { courseId, teacherId: user.id }, select: { id: true } })
    );

  if (!isTeam) {
    if (!resource.downloadable) {
      return NextResponse.json({ error: "Downloads are turned off for this file." }, { status: 403 });
    }
    const [enrollment, unlocked] = await Promise.all([
      db.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
        select: { id: true },
      }),
      db.coinPurchase.findFirst({
        where: { userId: user.id, item: { lessonId: resource.lesson.id } },
        select: { id: true },
      }),
    ]);
    if (!enrollment && !resource.lesson.isPreview && !unlocked) {
      return NextResponse.json({ error: "Enroll in this mission to download its files." }, { status: 403 });
    }
  }

  // Only files the app itself stored are ever served.
  const upload = await db.upload.findUnique({
    where: { url: resource.url },
    select: { name: true, fileType: true, provider: true, driveFileId: true },
  });
  if (!upload) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const fileName = downloadName(resource.title, upload.name);
  const headers: Record<string, string> = {
    "Content-Type": upload.fileType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${asciiName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
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

/** The resource title, with the stored file's extension if the title has none. */
function downloadName(title: string, storedName: string): string {
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(storedName)?.[0] ?? "";
  const clean = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "lecture-file";
  return ext && !clean.toLowerCase().endsWith(ext.toLowerCase()) ? `${clean}${ext}` : clean;
}

/** Header-safe fallback for old clients; the UTF-8 form carries the real name. */
function asciiName(name: string): string {
  return name.replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "");
}
