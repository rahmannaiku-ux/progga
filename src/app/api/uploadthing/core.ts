import { createUploadthing, type FileRouter } from "uploadthing/next";
import { db } from "@/lib/db/client";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";

const f = createUploadthing();

// PHASE 5: migrated off Clerk — both helpers below now resolve identity
// via the custom session instead of Clerk auth() + a clerkId lookup.

async function requireMentorForUpload() {
  const user = await getCurrentActiveSessionUser();
  if (!user || !["TEACHER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw new Error("Only mentors can upload lesson resources.");
  }
  return { userId: user.id };
}

async function requireActiveUserForUpload() {
  const user = await getCurrentActiveSessionUser();
  if (!user) throw new Error("Unauthorized");
  return { userId: user.id };
}

/**
 * Persists a server-side record of a completed upload, from trusted
 * metadata set in this route's own middleware — never from anything a
 * client asserts afterward. Downstream actions that accept a file URL
 * from the client (attachLessonResource, submitAssignment) look the
 * URL up here and verify uploaderId + context before trusting it,
 * rather than trusting a client-supplied URL directly.
 */
async function recordUpload(
  uploaderId: string,
  context: "LESSON_RESOURCE" | "ASSIGNMENT_SUBMISSION" | "AVATAR",
  file: { key: string; url: string; name: string; size?: number; type?: string }
) {
  await db.upload.create({
    data: {
      uploaderId,
      context,
      key: file.key,
      url: file.url,
      name: file.name,
      sizeBytes: file.size ?? 0,
      fileType: file.type ?? "application/octet-stream",
    },
  });
}

export const ourFileRouter = {
  lessonPdfUploader: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(() => requireMentorForUpload())
    .onUploadComplete(async ({ metadata, file }) => {
      await recordUpload(metadata.userId, "LESSON_RESOURCE", file);
      return { uploaderId: metadata.userId, url: file.url, name: file.name };
    }),

  lessonResourceUploader: f({
    "application/pdf": { maxFileSize: "16MB", maxFileCount: 5 },
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    "application/zip": { maxFileSize: "32MB", maxFileCount: 3 },
    text: { maxFileSize: "8MB", maxFileCount: 5 },
  })
    .middleware(() => requireMentorForUpload())
    .onUploadComplete(async ({ metadata, file }) => {
      await recordUpload(metadata.userId, "LESSON_RESOURCE", file);
      return { uploaderId: metadata.userId, url: file.url, name: file.name };
    }),

  avatarUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const { userId } = await requireActiveUserForUpload();
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await recordUpload(metadata.userId, "AVATAR", file);
      // Avatar is the one case where the server sets the field directly
      // from its own trusted metadata rather than a client resubmitting
      // the URL afterward, so there's no separate ownership check to
      // add downstream — this IS the trusted write.
      await db.user.update({
        where: { id: metadata.userId },
        data: { avatarUrl: file.url },
      });
    }),

  assignmentSubmissionUploader: f({
    "application/pdf": { maxFileSize: "16MB", maxFileCount: 5 },
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    "application/zip": { maxFileSize: "32MB", maxFileCount: 3 },
    text: { maxFileSize: "8MB", maxFileCount: 5 },
    video: { maxFileSize: "64MB", maxFileCount: 1 },
  })
    .middleware(() => requireActiveUserForUpload())
    .onUploadComplete(async ({ metadata, file }) => {
      await recordUpload(metadata.userId, "ASSIGNMENT_SUBMISSION", file);
      return { uploaderId: metadata.userId, url: file.url, name: file.name };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
