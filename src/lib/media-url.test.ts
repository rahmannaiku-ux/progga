import { describe, expect, it } from "vitest";
import { mediaSrc, mediaViewUrl } from "./media-url";

describe("mediaSrc / mediaViewUrl", () => {
  it("uses our own upload address as it is", () => {
    expect(mediaSrc("/api/files/abc")).toBe("/api/files/abc");
    expect(mediaViewUrl("/api/files/abc")).toBe("/api/files/abc");
  });

  it("still understands an older pasted Drive link", () => {
    expect(mediaSrc("https://drive.google.com/file/d/abc123/view", 1600)).toBe(
      "https://drive.google.com/thumbnail?id=abc123&sz=w1600"
    );
    expect(mediaViewUrl("https://drive.google.com/file/d/abc123/view")).toBe(
      "https://drive.google.com/file/d/abc123/view"
    );
  });

  it("passes the backup storage address through and ignores junk", () => {
    expect(mediaSrc("https://utfs.io/f/key")).toBe("https://utfs.io/f/key");
    expect(mediaSrc(null)).toBeNull();
    expect(mediaSrc("javascript:alert(1)")).toBeNull();
  });
});
