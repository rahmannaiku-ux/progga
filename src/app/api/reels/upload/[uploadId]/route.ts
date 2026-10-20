import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { REEL_CHUNK_BYTES } from "@/lib/community/rules";
import { putResumableChunk } from "@/lib/storage/google-drive";
import { matchesSignature } from "@/lib/storage/limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One chunk of a reel upload (see startReelUpload). The body is the raw
 * bytes, `X-Chunk-Start` says where they go. Only the person who started
 * the upload can add to it; the bytes are forwarded to the Drive session
 * kept on the Upload row and never stored here. Answers how much Drive
 * holds, so the browser can resume after a dropped connection, and the
 * video's address once the last chunk lands.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ uploadId: string }> }) {
  const params = await props.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.uploadId)) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  const user = await getCurrentSessionUser();
  if (!user || !user.isActive || user.isSuspended) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const upload = await db.upload.findUnique({
    where: { id: params.uploadId },
    select: { id: true, uploaderId: true, context: true, resumableUrl: true, sizeBytes: true, fileType: true, url: true },
  });
  if (!upload || upload.uploaderId !== user.id || upload.context !== "COMMUNITY_VIDEO") {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  if (!upload.resumableUrl) {
    // Already finished (a retried last chunk): just answer with the result.
    return NextResponse.json({ done: true, url: upload.url });
  }

  const start = Number(req.headers.get("x-chunk-start"));
  const body = new Uint8Array(await req.arrayBuffer());
  const total = upload.sizeBytes;
  const isLast = start + body.byteLength === total;
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    body.byteLength === 0 ||
    body.byteLength > REEL_CHUNK_BYTES ||
    start + body.byteLength > total ||
    // Drive needs every chunk but the last to be a multiple of 256 KiB.
    (!isLast && body.byteLength % (256 * 1024) !== 0)
  ) {
    return NextResponse.json({ error: "That piece of the video didn't fit. Try again." }, { status: 400 });
  }
  // The first bytes must really be the kind of video that was declared.
  if (start === 0 && !matchesSignature(upload.fileType, Buffer.from(body.subarray(0, 64)))) {
    await db.upload.delete({ where: { id: upload.id } }).catch(() => {});
    return NextResponse.json({ error: "That file isn't a video we can play. Choose an MP4, MOV or WebM." }, { status: 415 });
  }

  try {
    const res = await putResumableChunk(upload.resumableUrl, body, start, total);
    if (!res.done) return NextResponse.json({ done: false, received: res.received });

    const url = `/api/files/${upload.id}`;
    await db.upload.update({
      where: { id: upload.id },
      data: { driveFileId: res.driveFileId, key: `drive:${res.driveFileId}`, url, sizeBytes: res.size, resumableUrl: null },
    });
    return NextResponse.json({ done: true, url });
  } catch (err) {
    console.error(`Reel upload ${upload.id} chunk at ${start} failed:`, err);
    return NextResponse.json({ error: "The upload was interrupted. Retrying..." }, { status: 502 });
  }
}
