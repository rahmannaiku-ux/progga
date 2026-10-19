import { describe, expect, it } from "vitest";
import { detectApp, guessPlatform, parseLatestRelease } from "./apps";

describe("detectApp", () => {
  it("recognises both apps by their user agent tag", () => {
    expect(detectApp("Mozilla/5.0 (Linux; Android 14) ... Chrome/130 Mobile ProggaaApp/Android/1.2.3")).toEqual({
      kind: "android",
      version: "1.2.3",
    });
    expect(detectApp("Mozilla/5.0 (Windows NT 10.0) ... Edg/131.0.0.0 ProggaaDesktop/1.0.0")).toEqual({
      kind: "windows",
      version: "1.0.0",
    });
  });

  it("is null in a normal browser", () => {
    expect(detectApp("Mozilla/5.0 (Windows NT 10.0) Chrome/131")).toBeNull();
    expect(detectApp(null)).toBeNull();
  });
});

describe("guessPlatform", () => {
  it("puts the visitor's own device first", () => {
    expect(guessPlatform("Mozilla/5.0 (Linux; Android 14; SM-A145F)")).toBe("android");
    expect(guessPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(guessPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(guessPlatform("Mozilla/5.0 (Macintosh)")).toBe("other");
  });
});

describe("parseLatestRelease", () => {
  it("reads the version, date and file sizes", () => {
    expect(
      parseLatestRelease({
        tag_name: "v1.0.2",
        published_at: "2026-10-19T08:00:00Z",
        assets: [
          { name: "Proggaa-Setup.exe", size: 3_000_000 },
          { name: "Proggaa.apk", size: 2_000_000 },
        ],
      })
    ).toEqual({ version: "1.0.2", publishedAt: "2026-10-19T08:00:00Z", windowsBytes: 3_000_000, androidBytes: 2_000_000 });
  });

  it("is null for anything else", () => {
    expect(parseLatestRelease({ message: "Not Found" })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });
});
