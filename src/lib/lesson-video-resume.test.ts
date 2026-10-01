import { describe, expect, it } from "vitest";
import { resumeSecondsForReopen } from "@/lib/lesson-video-resume";

describe("resumeSecondsForReopen", () => {
  it("uses the saved position before anything was watched this visit", () => {
    expect(resumeSecondsForReopen(120, 0, 0)).toBe(120);
  });

  it("prefers the newer position reported by the player", () => {
    expect(resumeSecondsForReopen(120, 300.7, 900)).toBe(300);
  });

  it("starts over after the video was watched to the end", () => {
    expect(resumeSecondsForReopen(120, 899, 900)).toBe(0);
  });

  it("never returns a negative start", () => {
    expect(resumeSecondsForReopen(-5, 0, 0)).toBe(0);
  });
});
