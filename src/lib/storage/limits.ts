import type { UploadContext } from "@prisma/client";

/**
 * Central, easy-to-change upload limits — one file, not scattered
 * magic numbers. Mirrors the max sizes already configured on the
 * matching UploadThing routes in app/api/uploadthing/core.ts (kept in
 * sync deliberately: the same context should accept the same size
 * whichever provider ends up handling it, so switching providers never
 * silently changes what a student is allowed to submit).
 */
export const UPLOAD_LIMITS: Record<UploadContext, { maxSizeBytes: number; allowedMimeTypes: string[] }> = {
  AVATAR: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  },
  ASSIGNMENT_SUBMISSION: {
    maxSizeBytes: 25 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/zip",
      "text/plain",
    ],
  },
  CERTIFICATE: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  },
  COMMUNITY_IMAGE: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  },
  OTHER: {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"],
  },
  // Not user-configurable here — LESSON_RESOURCE stays entirely on the
  // existing UploadThing route (see core.ts), which already enforces
  // its own per-file-type limits. Present in this map only so the
  // Record<UploadContext, ...> type stays exhaustive; deliberately
  // never read by the Drive upload path.
  LESSON_RESOURCE: {
    maxSizeBytes: 32 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "application/zip", "text/plain"],
  },
};

export function assertUploadAllowed(
  context: UploadContext,
  file: { size: number; type: string; buffer: Buffer }
) {
  const limit = UPLOAD_LIMITS[context];
  if (file.size > limit.maxSizeBytes) {
    const mb = (limit.maxSizeBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`File is too large. Maximum size for this upload type is ${mb} MB.`);
  }
  if (!limit.allowedMimeTypes.includes(file.type)) {
    throw new Error(`File type "${file.type || "unknown"}" is not allowed for this upload type.`);
  }

  // The client-reported `type` (from the browser's File object) is not
  // trustworthy on its own — a relabeled file (e.g. HTML sent as
  // image/png) would otherwise pass the check above and be stored/
  // served with that claimed type. For the types below, verify the
  // actual bytes match a real signature for that type. `text/plain`
  // has no magic number to check (any byte sequence is "valid" plain
  // text) — the allowlist's own narrowness (no text/html anywhere) is
  // what keeps that one an acceptable, if imperfect, exception.
  if (!matchesSignature(file.type, file.buffer)) {
    throw new Error(
      `File contents don't match the claimed type "${file.type}". The file may be corrupted or mislabeled.`
    );
  }
}

const SIGNATURE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  "application/pdf": (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/png": (buf) =>
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (buf) =>
    buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/gif": (buf) => {
    const sig = buf.subarray(0, 6).toString("latin1");
    return sig === "GIF87a" || sig === "GIF89a";
  },
  "image/webp": (buf) =>
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP",
  "application/zip": (buf) =>
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07),
  // No real signature exists for plain text — every byte sequence is
  // technically valid. Deliberately not in SIGNATURE_CHECKS below, so
  // it always falls through to the `true` default.
};

function matchesSignature(claimedType: string, buf: Buffer): boolean {
  const check = SIGNATURE_CHECKS[claimedType];
  return check ? check(buf) : true;
}
