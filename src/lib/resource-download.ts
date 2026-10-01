export type ResourceAccessMode = "download" | "view";

export type ResourceAccessInput = {
  /** Mission owner, co-teacher or admin: always allowed. */
  isTeam: boolean;
  /** The per-file switch set in the mission builder. */
  downloadable: boolean;
  mode: ResourceAccessMode;
  enrolled: boolean;
  isPreview: boolean;
  /** Lesson unlocked on its own through the coin store. */
  unlocked: boolean;
};

export type ResourceAccess = { ok: true } | { ok: false; status: 403; error: string };

/**
 * Who may open or download a lesson file. Viewing follows the lesson's own
 * access rule; downloading additionally needs the file's switch turned on.
 */
export function decideResourceAccess(input: ResourceAccessInput): ResourceAccess {
  if (input.isTeam) return { ok: true };
  if (input.mode === "download" && !input.downloadable) {
    return { ok: false, status: 403, error: "Downloads are turned off for this file." };
  }
  if (!input.enrolled && !input.isPreview && !input.unlocked) {
    return { ok: false, status: 403, error: "Enroll in this mission to open its files." };
  }
  return { ok: true };
}

/** Types a browser can show without running anything. SVG and HTML are not on it. */
const INLINE_SAFE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export function canShowInline(fileType: string): boolean {
  return INLINE_SAFE_TYPES.has(fileType.toLowerCase());
}

/** The resource title, with the stored file's extension if the title has none. */
export function downloadFileName(title: string, storedName: string): string {
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(storedName)?.[0] ?? "";
  const clean = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "lecture-file";
  return ext && !clean.toLowerCase().endsWith(ext.toLowerCase()) ? `${clean}${ext}` : clean;
}

/** Header-safe fallback for old clients; the UTF-8 form carries the real name. */
export function asciiFileName(name: string): string {
  return name.replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "");
}
