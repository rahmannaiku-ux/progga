import { describe, expect, it } from "vitest";
import { selfSwitchEligibility, switchDifferenceCents } from "./rules";

const base = {
  completedSelfSwitches: 0,
  hasOpenSwitch: false,
  fromCourseId: "a",
  toCourseId: "b",
  ownsFrom: true,
  fromIsFree: false,
  ownsTo: false,
  toPublished: true,
};

describe("switchDifferenceCents", () => {
  it("is free when the new mission costs the same", () => {
    expect(switchDifferenceCents(500000, 500000)).toBe(0);
  });
  it("is free when the new mission costs less", () => {
    expect(switchDifferenceCents(500000, 300000)).toBe(0);
  });
  it("charges the difference when the new mission costs more", () => {
    expect(switchDifferenceCents(300000, 500000)).toBe(200000);
  });
});

describe("selfSwitchEligibility", () => {
  it("allows the first switch", () => {
    expect(selfSwitchEligibility(base)).toEqual({ ok: true });
  });
  it("allows only one switch of the student's own", () => {
    expect(selfSwitchEligibility({ ...base, completedSelfSwitches: 1 })).toEqual({ ok: false, reason: "used" });
  });
  it("blocks while another switch is open", () => {
    expect(selfSwitchEligibility({ ...base, hasOpenSwitch: true })).toEqual({ ok: false, reason: "pending" });
  });
  it("needs an enrollment in the old mission and none in the new one", () => {
    expect(selfSwitchEligibility({ ...base, ownsFrom: false })).toEqual({ ok: false, reason: "not_owned" });
    expect(selfSwitchEligibility({ ...base, ownsTo: true })).toEqual({ ok: false, reason: "already_enrolled" });
  });
  it("refuses the same mission, a free one, and an unpublished target", () => {
    expect(selfSwitchEligibility({ ...base, toCourseId: "a" })).toEqual({ ok: false, reason: "same" });
    expect(selfSwitchEligibility({ ...base, fromIsFree: true })).toEqual({ ok: false, reason: "free_from" });
    expect(selfSwitchEligibility({ ...base, toPublished: false })).toEqual({ ok: false, reason: "unavailable" });
  });
});
