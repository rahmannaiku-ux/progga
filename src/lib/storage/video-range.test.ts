import { describe, expect, it } from "vitest";
import { videoRange } from "@/lib/storage/video-range";

const MB = 1024 * 1024;

describe("video range", () => {
  it("answers an open-ended request with the first piece", () => {
    expect(videoRange("bytes=0-", 20 * MB)).toBe(`bytes=0-${4 * MB - 64 * 1024 - 1}`);
    expect(videoRange(null, 20 * MB)).toBe(`bytes=0-${4 * MB - 64 * 1024 - 1}`);
  });
  it("keeps a small request as it is", () => {
    expect(videoRange("bytes=100-199", 20 * MB)).toBe("bytes=100-199");
  });
  it("stops at the end of the file", () => {
    expect(videoRange("bytes=900-", 1000)).toBe("bytes=900-999");
  });
  it("serves the last bytes for a suffix request", () => {
    expect(videoRange("bytes=-500", 1000)).toBe("bytes=500-999");
  });
  it("never starts past the end", () => {
    expect(videoRange("bytes=5000-", 1000)).toBe("bytes=999-999");
  });
});
