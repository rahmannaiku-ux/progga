import { describe, expect, it } from "vitest";
import { YOUTUBE_CLEAN_PLAYER_VARS, liveEmbedUrl } from "@/lib/youtube";

describe("YouTube embed settings", () => {
  it("keeps captions off by default and reduces recommendations", () => {
    expect(YOUTUBE_CLEAN_PLAYER_VARS.cc_load_policy).toBe(0);
    expect(YOUTUBE_CLEAN_PLAYER_VARS.rel).toBe(0);
    // Nothing may switch captions on automatically.
    expect(Object.keys(YOUTUBE_CLEAN_PLAYER_VARS)).not.toContain("cc_lang_pref");
  });

  it("builds the live embed URL with the same settings", () => {
    const params = new URL(liveEmbedUrl("abcdefghijk")).searchParams;
    expect(params.get("cc_load_policy")).toBe("0");
    expect(params.get("rel")).toBe("0");
    expect(params.get("playsinline")).toBe("1");
    expect(params.get("autoplay")).toBe("1");
  });
});
