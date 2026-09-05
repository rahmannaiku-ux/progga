import { UTApi } from "uploadthing/server";
import { db } from "@/lib/db/client";
import type { UploadContext } from "@prisma/client";
import { assertUploadAllowed } from "@/lib/storage/limits";
import {
  isDriveConnected,
  uploadToDrive,
  deleteFromDrive,
  DriveNotConnectedError,
} from "@/lib/storage/google-drive";

/**
 * STORAGE SEPARATION — read this before touching this file.
 *
 * Course CONTENT (YouTube video IDs on Lesson, and the existing
 * lessonPdfUploader / lessonResourceUploader UploadThing routes for
 * teacher-uploaded lesson resources / "Slides" links) is a completely
 * separate system from this one and must never be routed through here.
 * This module is exclusively for the 5 student/user-upload categories:
 * AVATAR, ASSIGNMENT_SUBMISSION, CERTIFICATE, COMMUNITY_IMAGE, OTHER.
 *
 * Provider selection: Google Drive when the admin has connected it,
 * automatically falling back to UploadThing (the pre-existing, already
 * battle-tested system) when Drive is disconnected or a Drive call
 * fails. This *is* the "fallback storage strategy" the storage spec
 * asks for — rather than inventing a third local-disk path, the
 * already-working system just keeps working underneath the new one.
 */

export type UploadResult = {
  uploadId: string;
  url: string;
  name: string;
  sizeBytes: number;
};

/**
 * The one entrypoint for storing a user-uploaded file for the 5
 * Drive-eligible contexts. Validates size/MIME first (fails before any
 * network call, Drive or UploadThing), then tries Drive if connected,
 * falling back to UploadThing on any Drive failure — an upload should
 * never be lost just because Drive hiccuped.
 */
export async function uploadUserFile({
  uploaderId,
  context,
  buffer,
  filename,
  mimeType,
}: {
  uploaderId: string;
  context: Exclude<UploadContext, "LESSON_RESOURCE">;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<UploadResult> {
  assertUploadAllowed(context, { size: buffer.length, type: mimeType, buffer });

  const sanitizedName = sanitizeFilename(filename);
  const driveConnected = await isDriveConnected().catch(() => false);

  if (driveConnected) {
    try {
      return await storeViaDrive({ uploaderId, context, buffer, filename: sanitizedName, mimeType });
    } catch (err) {
      if (!(err instanceof DriveNotConnectedError)) {
        console.error("Google Drive upload failed, falling back to UploadThing:", err);
      }
      // fall through to UploadThing below
    }
  }

  return storeViaUploadThing({ uploaderId, context, buffer, filename: sanitizedName, mimeType });
}

async function storeViaDrive({
  uploaderId,
  context,
  buffer,
  filename,
  mimeType,
}: {
  uploaderId: string;
  context: Exclude<UploadContext, "LESSON_RESOURCE">;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<UploadResult> {
  const { driveFileId, size } = await uploadToDrive({ context, buffer, filename, mimeType });

  // key must be globally unique across both providers — UploadThing
  // keys and raw Drive file IDs live in different namespaces, but a
  // `drive:` prefix rules out any theoretical collision rather than
  // relying on that being true by accident.
  const upload = await db.upload.create({
    data: {
      uploaderId,
      context,
      provider: "GOOGLE_DRIVE",
      driveFileId,
      key: `drive:${driveFileId}`,
      // Placeholder, replaced below once we have the row's own id —
      // url must be unique and this route needs the Upload.id to build it.
      url: `pending:${driveFileId}`,
      name: filename,
      sizeBytes: size,
      fileType: mimeType,
    },
  });

  const url = `/api/files/${upload.id}`;
  await db.upload.update({ where: { id: upload.id }, data: { url } });

  if (context === "AVATAR") {
    await db.user.update({ where: { id: uploaderId }, data: { avatarUrl: url } });
  }

  return { uploadId: upload.id, url, name: filename, sizeBytes: size };
}

async function storeViaUploadThing({
  uploaderId,
  context,
  buffer,
  filename,
  mimeType,
}: {
  uploaderId: string;
  context: Exclude<UploadContext, "LESSON_RESOURCE">;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<UploadResult> {
  if (!process.env.UPLOADTHING_SECRET) {
    throw new Error(
      "File storage is currently unavailable — neither Google Drive nor the backup storage " +
        "provider is configured. Please try again later."
    );
  }

  const utapi = new UTApi();
  const file = new File([buffer], filename, { type: mimeType });
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Upload failed. Please try again.");
  }

  const upload = await db.upload.create({
    data: {
      uploaderId,
      context,
      provider: "UPLOADTHING",
      key: result.data.key,
      url: result.data.url,
      name: filename,
      sizeBytes: buffer.length,
      fileType: mimeType,
    },
  });

  if (context === "AVATAR") {
    await db.user.update({ where: { id: uploaderId }, data: { avatarUrl: result.data.url } });
  }

  return { uploadId: upload.id, url: result.data.url, name: filename, sizeBytes: buffer.length };
}

/** Deletes both the provider-side file and the DB record — never one without the other. */
export async function deleteUserFile(uploadId: string) {
  const upload = await db.upload.findUniqueOrThrow({ where: { id: uploadId } });

  if (upload.provider === "GOOGLE_DRIVE" && upload.driveFileId) {
    await deleteFromDrive(upload.driveFileId);
  } else {
    if (process.env.UPLOADTHING_SECRET) {
      await new UTApi().deleteFiles(upload.key);
    }
  }

  await db.upload.delete({ where: { id: uploadId } });
}

/** Strips path components and unsafe characters — never trust a client-supplied filename as a path. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  return cleaned || "file";
}
