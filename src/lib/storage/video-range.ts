/**
 * Videos (reels) are served in pieces of at most VIDEO_PIECE bytes: one
 * response must stay under the hosting platform's size cap, and a video
 * player simply asks for the next piece. An open-ended or oversized
 * request ("bytes=0-") is answered with the first piece of it.
 */
const VIDEO_PIECE = 4 * 1024 * 1024 - 64 * 1024;

export function videoRange(header: string | null, size: number): string {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  let start = 0;
  let end = size - 1;
  if (m && m[1]) {
    start = Number(m[1]);
    if (m[2]) end = Number(m[2]);
  } else if (m && m[2]) {
    // "bytes=-N": the last N bytes (players use it to find an MP4's index).
    start = Math.max(0, size - Number(m[2]));
  }
  start = Math.min(start, Math.max(0, size - 1));
  end = Math.min(end, start + VIDEO_PIECE - 1, size - 1);
  return `bytes=${start}-${Math.max(start, end)}`;
}
