import { driveThumbnailUrl, driveViewUrl } from "@/lib/google-embed";

/**
 * Mission routine and patrol thumbnail images are stored as the URL the
 * upload endpoint returned (`/api/files/<id>` for Google Drive, or the
 * backup host's address). Earlier versions stored a pasted Google Drive
 * link instead, so those are still understood here.
 */
export function mediaSrc(stored: string | null | undefined, width = 640): string | null {
  if (!stored) return null;
  if (stored.startsWith("/api/files/")) return stored;
  if (stored.startsWith("https://")) return driveThumbnailUrl(stored, width) ?? stored;
  return null;
}

/** Where tapping an image opens it at full size. */
export function mediaViewUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("/api/files/")) return stored;
  if (stored.startsWith("https://")) return driveViewUrl(stored) ?? stored;
  return null;
}
