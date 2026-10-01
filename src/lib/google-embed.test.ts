import { describe, expect, it } from "vitest";
import { driveThumbnailUrl, parseDriveFileId } from "./google-embed";

describe("parseDriveFileId", () => {
  it("reads the id from view, open and uc links", () => {
    expect(parseDriveFileId("https://drive.google.com/file/d/abc_123-X/view?usp=sharing")).toBe("abc_123-X");
    expect(parseDriveFileId("https://drive.google.com/open?id=abc123")).toBe("abc123");
    expect(parseDriveFileId("https://drive.google.com/uc?export=view&id=abc123")).toBe("abc123");
  });

  it("rejects other hosts, folders and junk", () => {
    expect(parseDriveFileId("https://evil.example/file/d/abc/view")).toBeNull();
    expect(parseDriveFileId("https://drive.google.com/drive/folders/abc")).toBeNull();
    expect(parseDriveFileId("http://drive.google.com/file/d/abc/view")).toBeNull();
    expect(parseDriveFileId("not a url")).toBeNull();
  });
});

describe("driveThumbnailUrl", () => {
  it("builds a Google-only thumbnail address", () => {
    expect(driveThumbnailUrl("https://drive.google.com/file/d/abc123/view")).toBe(
      "https://drive.google.com/thumbnail?id=abc123&sz=w640"
    );
  });

  it("returns null when there is nothing usable", () => {
    expect(driveThumbnailUrl(null)).toBeNull();
    expect(driveThumbnailUrl("")).toBeNull();
    expect(driveThumbnailUrl("https://example.com/x.png")).toBeNull();
  });
});
