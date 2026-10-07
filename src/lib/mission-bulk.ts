import { extractYoutubeId } from "@/lib/youtube";

/** What the mission builder's quick-add box can create. */
export type BulkKind = "modules" | "chapters" | "groups" | "lessons";

export function isBulkKind(value: string): value is BulkKind {
  return value === "modules" || value === "chapters" || value === "groups" || value === "lessons";
}

export const BULK_MAX_LINES = 100;

/** Same title lengths the single-item forms enforce (lib/validation/course.ts). */
const MIN_TITLE: Record<BulkKind, number> = { modules: 3, chapters: 3, groups: 2, lessons: 3 };
const MAX_TITLE = 120;

export type BulkLesson = { title: string; youtubeVideoId: string };

export type BulkParse<T> = { ok: true; items: T[] } | { ok: false; error: string };

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** One title per line (blank lines ignored). Used for operations, chapters and class types. */
export function parseTitleLines(text: string, kind: Exclude<BulkKind, "lessons">): BulkParse<string> {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, error: "Type a title first." };
  if (lines.length > BULK_MAX_LINES) {
    return { ok: false, error: `Add at most ${BULK_MAX_LINES} at a time.` };
  }
  for (const [i, title] of lines.entries()) {
    if (title.length < MIN_TITLE[kind]) {
      return { ok: false, error: `Line ${i + 1} is too short (at least ${MIN_TITLE[kind]} characters).` };
    }
    if (title.length > MAX_TITLE) {
      return { ok: false, error: `Line ${i + 1} is too long (at most ${MAX_TITLE} characters).` };
    }
  }
  return { ok: true, items: lines };
}

/**
 * One patrol per line: `Title | YouTube link`. Thumbnails are uploaded per patrol afterwards.
 * A tab works as the separator too, so rows pasted from a spreadsheet just work.
 */
export function parseLessonLines(text: string): BulkParse<BulkLesson> {
  const lines = splitLines(text);
  if (lines.length === 0) return { ok: false, error: "Type a patrol first." };
  if (lines.length > BULK_MAX_LINES) {
    return { ok: false, error: `Add at most ${BULK_MAX_LINES} at a time.` };
  }

  const items: BulkLesson[] = [];
  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    const [title = "", video = ""] = line.split(/\s*[|\t]\s*/).map((p) => p.trim());
    if (title.length < MIN_TITLE.lessons) {
      return { ok: false, error: `Line ${n}: the title is too short (at least ${MIN_TITLE.lessons} characters).` };
    }
    if (title.length > MAX_TITLE) {
      return { ok: false, error: `Line ${n}: the title is too long (at most ${MAX_TITLE} characters).` };
    }
    const youtubeVideoId = extractYoutubeId(video);
    if (!youtubeVideoId) {
      return { ok: false, error: `Line ${n}: add a YouTube link after the title, like "${title} | https://youtu.be/...".` };
    }
    items.push({ title, youtubeVideoId });
  }
  return { ok: true, items };
}
