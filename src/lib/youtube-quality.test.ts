import { describe, expect, it } from "vitest";
import { isBelowChoice, isQualityChoice, offeredChoices, scaledPlayerStyle } from "./youtube-quality";

describe("offeredChoices", () => {
  it("only offers levels the video has, highest first", () => {
    expect(offeredChoices(["hd1080", "hd720", "large", "medium", "small", "tiny", "auto"])).toEqual([
      "hd1080",
      "hd720",
      "large",
    ]);
    expect(offeredChoices(["hd720", "large", "medium"])).toEqual(["hd720", "large"]);
    expect(offeredChoices([])).toEqual([]);
  });
});

describe("scaledPlayerStyle", () => {
  it("is null for Auto or before the box is measured", () => {
    expect(scaledPlayerStyle("auto", { width: 400, height: 225 })).toBeNull();
    expect(scaledPlayerStyle("hd1080", null)).toBeNull();
    expect(scaledPlayerStyle("hd1080", { width: 0, height: 0 })).toBeNull();
  });

  it("lays the player out at the quality's width and scales it down to a phone box", () => {
    expect(scaledPlayerStyle("hd1080", { width: 393, height: 221 })).toEqual({
      width: "1920px",
      height: "1080px",
      transform: `scale(${393 / 1920})`,
      transformOrigin: "0 0",
    });
  });

  it("keeps the box's aspect ratio (landscape fullscreen on an iPhone)", () => {
    const s = scaledPlayerStyle("hd720", { width: 852, height: 393 })!;
    expect(s.width).toBe("1280px");
    expect(s.height).toBe(`${Math.round(393 / (852 / 1280))}px`);
  });

  it("scales UP for 480p on a big screen, so YouTube streams the smaller size", () => {
    expect(scaledPlayerStyle("large", { width: 1280, height: 720 })?.transform).toBe("scale(2)");
  });
});

describe("isBelowChoice", () => {
  it("flags when the connection holds YouTube below the choice", () => {
    expect(isBelowChoice("hd1080", "hd720")).toBe(true);
    expect(isBelowChoice("hd1080", "hd1080")).toBe(false);
    expect(isBelowChoice("large", "hd720")).toBe(false);
    expect(isBelowChoice("auto", "small")).toBe(false);
  });
});

describe("isQualityChoice", () => {
  it("accepts only the stored values", () => {
    expect(isQualityChoice("hd720")).toBe(true);
    expect(isQualityChoice("medium")).toBe(false);
    expect(isQualityChoice(null)).toBe(false);
  });
});
