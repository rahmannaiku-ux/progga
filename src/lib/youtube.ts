/**
 * Extracts a YouTube video ID from any common URL shape a mentor might
 * paste: watch?v=, youtu.be/, embed/, shorts/, or a bare 11-char ID.
 * Returns null if nothing recognizable is found, so callers can show a
 * validation error instead of silently embedding a broken player.
 */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare video ID (11 chars, YouTube's alphabet)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const embedMatch = url.pathname.match(/^\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[2]!;
    }
  } catch {
    // not a valid URL at all
    return null;
  }

  return null;
}

export function youtubeThumbnailUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Player parameters every Proggaa YouTube embed (lesson and live class) shares.
 *
 * - cc_load_policy 0: captions are not forced on. A student can still turn
 *   them on with YouTube's own CC control, and YouTube remembers that choice.
 *   Never set this to 1 or add cc_lang_pref, which would switch captions on.
 * - rel 0: related videos at the end come from the same channel instead of
 *   anywhere on YouTube. YouTube does NOT let an embed remove its end-of-video
 *   suggestions or end screen entirely, and we deliberately do not cover or
 *   hide them with overlays or DOM tricks, which YouTube's terms forbid.
 */
export const YOUTUBE_CLEAN_PLAYER_VARS = {
  rel: 0,
  cc_load_policy: 0,
  iv_load_policy: 3,
  modestbranding: 1,
  playsinline: 1,
} as const;

/**
 * Embed URL for a live class's YouTube stream. Deliberately separate
 * from the lesson player's embed setup (video-player.tsx uses the
 * react-youtube IFrame Player API wrapper for custom controls/progress
 * tracking) — a live class has no progress to track and needs none of
 * that, just a plain, responsive iframe. `autoplay=1` only takes effect
 * once the student has explicitly chosen to join (see
 * live-class-player.tsx, which doesn't mount this iframe until then),
 * so this never autoplays on page load. Captions off and reduced
 * recommendations come from YOUTUBE_CLEAN_PLAYER_VARS, shared with the
 * players in video-player.tsx and live-class-player.tsx.
 */
export function liveEmbedUrl(videoId: string) {
  const params = new URLSearchParams({ autoplay: "1" });
  for (const [key, value] of Object.entries(YOUTUBE_CLEAN_PLAYER_VARS)) params.set(key, String(value));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
