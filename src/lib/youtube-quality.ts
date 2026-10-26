/**
 * Choosing a YouTube quality for the student.
 *
 * The IFrame API's quality setters are no-ops since 2019 (setPlaybackQuality, suggestedQuality, the vq
 * parameter and the undocumented setPlaybackQualityRange command all left playback unchanged when measured).
 * What YouTube DOES respect is the size of the player: it streams the resolution that fits the player's
 * CSS size. So the player renders the iframe at the width that makes YouTube pick the chosen quality and
 * scales it to the visible box with a CSS transform. Measured in Chrome (desktop + Android profile, any
 * devicePixelRatio) by reading the decoded video height inside the player:
 *   iframe ≥ 1920px wide → 1080p · 854–1280px → 720p · ≤ 640px → 480p (YouTube never goes lower by size).
 * Raising the size mid-video switches up live; lowering it only takes effect after the video is reloaded
 * at the current time, so the player reloads on every change. The connection can still cap the quality:
 * the label always shows what YouTube reports it is actually playing.
 */

export type QualityChoice = "auto" | "hd1080" | "hd720" | "large";

/** Player width (CSS px) that makes YouTube stream each choice. */
export const QUALITY_PLAYER_WIDTH: Record<Exclude<QualityChoice, "auto">, number> = {
  hd1080: 1920,
  hd720: 1280,
  large: 640,
};

/** Highest first, as shown in the menu. */
export const QUALITY_CHOICES: QualityChoice[] = ["hd1080", "hd720", "large"];

export const QUALITY_STORAGE_KEY = "proggaa-video-quality";

export function isQualityChoice(v: unknown): v is QualityChoice {
  return v === "auto" || v === "hd1080" || v === "hd720" || v === "large";
}

/**
 * The choices to offer for a video, given the levels YouTube reports for it. A choice is only offered
 * when the video has that level, so a 720p upload never shows "1080p".
 */
export function offeredChoices(availableLevels: readonly string[]): QualityChoice[] {
  return QUALITY_CHOICES.filter((q) => availableLevels.includes(q));
}

/**
 * Inline style for the box that holds the iframe: the iframe is laid out at `width` × `height` CSS px
 * and scaled to cover the visible box exactly (same aspect ratio as the box, so nothing is cropped
 * beyond what the unscaled player shows). `null` = Auto, or the box size isn't known yet.
 */
export function scaledPlayerStyle(
  choice: QualityChoice,
  box: { width: number; height: number } | null
): { width: string; height: string; transform: string; transformOrigin: string } | null {
  if (choice === "auto" || !box || box.width <= 0 || box.height <= 0) return null;
  const width = QUALITY_PLAYER_WIDTH[choice];
  const scale = box.width / width;
  return {
    width: `${width}px`,
    height: `${Math.round(box.height / scale)}px`,
    transform: `scale(${scale})`,
    transformOrigin: "0 0",
  };
}

/** Whether YouTube's reported level is below the chosen one (e.g. the connection can't keep up). */
export function isBelowChoice(choice: QualityChoice, playing: string): boolean {
  if (choice === "auto") return false;
  const order = ["tiny", "small", "medium", "large", "hd720", "hd1080", "hd1440", "hd2160", "highres"];
  const p = order.indexOf(playing);
  return p >= 0 && p < order.indexOf(choice);
}

const CHANGE_EVENT = "proggaa:video-quality";
// Used when storage is blocked, so the choice still applies until the page is reloaded.
let memoryChoice: QualityChoice = "auto";

export function readSavedQuality(): QualityChoice {
  try {
    const v = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    return isQualityChoice(v) ? v : memoryChoice;
  } catch {
    return memoryChoice;
  }
}

export function saveQuality(choice: QualityChoice) {
  memoryChoice = choice;
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, choice);
  } catch {
    /* storage blocked: kept in memory for this visit */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore: the choice changed here or in another tab. */
export function subscribeQuality(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
