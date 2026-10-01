import { describe, expect, it } from "vitest";
import { parseLessonLines, parseTitleLines } from "./mission-bulk";

describe("parseTitleLines", () => {
  it("takes one title per line and skips blanks", () => {
    const r = parseTitleLines("  Physics 1st Paper \r\n\n Higher Math  \n", "modules");
    expect(r).toEqual({ ok: true, items: ["Physics 1st Paper", "Higher Math"] });
  });

  it("rejects empty input, short titles and too many lines", () => {
    expect(parseTitleLines("  \n ", "chapters").ok).toBe(false);
    expect(parseTitleLines("ab", "chapters").ok).toBe(false);
    expect(parseTitleLines("ab", "groups").ok).toBe(true);
    expect(parseTitleLines(Array.from({ length: 101 }, (_, i) => `Chapter ${i}`).join("\n"), "chapters").ok).toBe(false);
  });
});

describe("parseLessonLines", () => {
  it("reads title | video, with pipes or tabs", () => {
    const r = parseLessonLines("Lecture 1 | https://youtu.be/dQw4w9WgXcQ\nLecture 2\thttps://youtu.be/dQw4w9WgXcR");
    expect(r).toEqual({
      ok: true,
      items: [
        { title: "Lecture 1", youtubeVideoId: "dQw4w9WgXcQ" },
        { title: "Lecture 2", youtubeVideoId: "dQw4w9WgXcR" },
      ],
    });
  });

  it("names the line that is wrong", () => {
    const noVideo = parseLessonLines("Lecture 1 | https://youtu.be/dQw4w9WgXcQ\nLecture 2");
    expect(noVideo.ok).toBe(false);
    if (!noVideo.ok) expect(noVideo.error).toContain("Line 2");
  });
});
