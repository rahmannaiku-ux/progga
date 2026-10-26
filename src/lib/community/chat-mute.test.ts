import { describe, expect, it } from "vitest";
import { MUTED_FOREVER, isMuteChoice, isMuted, mutedLabel, muteUntil } from "./chat-mute";

const now = new Date("2026-10-26T06:00:00.000Z");
const time = (d: Date) => d.toISOString().slice(11, 16);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("muteUntil", () => {
  it("ends 8 hours or a week from now, never for always, and clears for off", () => {
    expect(muteUntil("8h", now)?.toISOString()).toBe("2026-10-26T14:00:00.000Z");
    expect(muteUntil("1w", now)?.toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(muteUntil("always", now)).toEqual(MUTED_FOREVER);
    expect(muteUntil("off", now)).toBeNull();
  });
});

describe("isMuted", () => {
  it("is muted only until the end time", () => {
    expect(isMuted(null, now)).toBe(false);
    expect(isMuted("2026-10-26T05:59:59.000Z", now)).toBe(false);
    expect(isMuted(new Date("2026-10-26T06:00:01.000Z"), now)).toBe(true);
    expect(isMuted(MUTED_FOREVER, now)).toBe(true);
  });
});

describe("mutedLabel", () => {
  it("says how long the mute lasts", () => {
    expect(mutedLabel(null, time, day, now)).toBeNull();
    expect(mutedLabel(MUTED_FOREVER.toISOString(), time, day, now)).toBe("Muted");
    expect(mutedLabel("2026-10-26T14:00:00.000Z", time, day, now)).toBe("Muted until 14:00");
    expect(mutedLabel("2026-11-02T06:00:00.000Z", time, day, now)).toBe("Muted until 2026-11-02");
    expect(mutedLabel("2026-10-26T05:00:00.000Z", time, day, now)).toBeNull();
  });
});

describe("isMuteChoice", () => {
  it("accepts only the menu's choices", () => {
    expect(isMuteChoice("8h")).toBe(true);
    expect(isMuteChoice("off")).toBe(true);
    expect(isMuteChoice("forever")).toBe(false);
    expect(isMuteChoice(undefined)).toBe(false);
  });
});
