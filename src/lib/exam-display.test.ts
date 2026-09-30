import { describe, expect, it } from "vitest";
import { formatDuration, formatScore, getAvailability, getExamCardState } from "@/lib/exam-display";

const att = (status: string, percentage: number | null = null, isPassed: boolean | null = null, id = status) => ({
  id,
  status,
  percentage,
  isPassed,
});

describe("getExamCardState", () => {
  const open = "always" as const;

  it("offers Start when nothing has been attempted", () => {
    expect(getExamCardState({ attempts: [], maxAttempts: 1, availability: open })).toMatchObject({
      key: "not-started",
      primary: "start",
    });
  });

  it("continues an in-progress attempt before anything else", () => {
    const s = getExamCardState({
      attempts: [att("IN_PROGRESS"), att("GRADED", 40, false)],
      maxAttempts: 3,
      availability: open,
    });
    expect(s).toMatchObject({ key: "in-progress", primary: "continue" });
  });

  it("shows only the result once passed, even with attempts left", () => {
    const s = getExamCardState({ attempts: [att("GRADED", 80, true)], maxAttempts: 3, availability: open });
    expect(s).toMatchObject({ key: "passed", primary: "result" });
  });

  it("offers a retake after a fail while attempts remain and access is open", () => {
    const s = getExamCardState({ attempts: [att("GRADED", 30, false)], maxAttempts: 2, availability: "open" });
    expect(s).toMatchObject({ key: "retry", primary: "retake" });
  });

  it("is completed when a fail has no attempts left or access has closed", () => {
    expect(getExamCardState({ attempts: [att("GRADED", 30, false)], maxAttempts: 1, availability: open }).key).toBe(
      "completed"
    );
    expect(getExamCardState({ attempts: [att("GRADED", 30, false)], maxAttempts: 5, availability: "closed" }).key).toBe(
      "completed"
    );
  });

  it("marks submitted-but-ungraded attempts as awaiting review", () => {
    const s = getExamCardState({ attempts: [att("SUBMITTED")], maxAttempts: 1, availability: open });
    expect(s).toMatchObject({ key: "awaiting-review", primary: "result" });
  });

  it("has no action for upcoming or closed exams", () => {
    expect(getExamCardState({ attempts: [], maxAttempts: 1, availability: "upcoming" })).toMatchObject({
      key: "upcoming",
      primary: null,
    });
    expect(getExamCardState({ attempts: [], maxAttempts: 1, availability: "closed" })).toMatchObject({
      key: "closed",
      primary: null,
    });
  });

  it("links the best graded attempt as the result", () => {
    const s = getExamCardState({
      attempts: [att("GRADED", 20, false, "new"), att("GRADED", 90, true, "best")],
      maxAttempts: 3,
      availability: open,
    });
    expect(s.resultAttemptId).toBe("best");
  });
});

describe("getAvailability", () => {
  const base = {
    isLiveExam: true,
    publishedAt: new Date("2026-01-01"),
    monitoringStartsAt: null,
    monitoringEndsAt: null,
    archivedAt: null,
  };
  const now = new Date("2026-06-01T10:00:00Z");

  it("is always open for non-live exams", () => {
    expect(getAvailability({ ...base, isLiveExam: false, accessOpensAt: null, accessClosesAt: null }, now)).toBe("always");
  });

  it("follows the student access window", () => {
    const opens = new Date("2026-06-02T00:00:00Z");
    const closes = new Date("2026-05-31T00:00:00Z");
    expect(getAvailability({ ...base, accessOpensAt: opens, accessClosesAt: null }, now)).toBe("upcoming");
    expect(getAvailability({ ...base, accessOpensAt: null, accessClosesAt: closes }, now)).toBe("closed");
    expect(getAvailability({ ...base, accessOpensAt: null, accessClosesAt: null }, now)).toBe("open");
  });
});

describe("formatters", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(1800)).toBe("30m");
    expect(formatDuration(5400)).toBe("1h 30m");
  });

  it("formats scores without float noise", () => {
    expect(formatScore(78)).toBe("78");
    expect(formatScore(7.800000001)).toBe("7.8");
    expect(formatScore(null)).toBe("–");
  });
});
