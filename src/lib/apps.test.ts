import { describe, expect, it } from "vitest";
import { compareVersions, detectApp, guessPlatform, isAppVersion, mustUpdate, nextPatch, parseLatestRelease } from "./apps";

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

describe("versions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("v2.0.0", "2.0.0")).toBe(0);
  });

  it("checks the format the apps accept", () => {
    expect(isAppVersion("1.0.2")).toBe(true);
    expect(isAppVersion("1.100.0")).toBe(false);
    expect(isAppVersion("1.0")).toBe(false);
    expect(isAppVersion("1.0.0-beta")).toBe(false);
  });

  it("suggests the next patch", () => {
    expect(nextPatch("1.0.4")).toBe("1.0.5");
    expect(nextPatch("1.0.99")).toBe("1.1.0");
    expect(nextPatch("nope")).toBe("1.0.0");
  });

  it("asks older apps to update", () => {
    expect(mustUpdate("1.0.0", "1.0.1")).toBe(true);
    expect(mustUpdate("1.0.1", "1.0.1")).toBe(false);
    expect(mustUpdate("1.2.0", "")).toBe(false);
    expect(mustUpdate("1.2.0", null)).toBe(false);
  });
});
