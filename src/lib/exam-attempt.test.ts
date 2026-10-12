import { describe, expect, it } from "vitest";
import {
  ANSWER_GRACE_SECONDS,
  attemptDeadline,
  buildQuestionSnapshot,
  canRevealAnswers,
  extraTimeForMinutesFromNow,
  hasAnswerContent,
  isAttemptExpired,
  resolveQuestion,
  seededShuffle,
  type SnapshotSource,
} from "@/lib/exam-attempt";
import { gradeAutoGradableQuestion, normalizeTypedAnswer } from "@/lib/grading";

const startedAt = new Date("2026-10-12T10:00:00Z");
const timed = { timeLimitSeconds: 600, autoSubmitOnExpiry: true };
const after = (seconds: number) => new Date(startedAt.getTime() + seconds * 1000);

describe("attempt deadline and expiry", () => {
  it("has no deadline when the exam is untimed", () => {
    const untimed = { timeLimitSeconds: null, autoSubmitOnExpiry: true };
    expect(attemptDeadline({ startedAt, extraTimeSeconds: 0 }, untimed)).toBeNull();
    expect(isAttemptExpired({ startedAt, extraTimeSeconds: 0 }, untimed, after(99999))).toBe(false);
  });

  it("adds a mentor's extra time to the deadline", () => {
    expect(attemptDeadline({ startedAt, extraTimeSeconds: 120 }, timed)).toEqual(after(720));
  });

  it("expires only after the grace period", () => {
    const attempt = { startedAt, extraTimeSeconds: 0 };
    expect(isAttemptExpired(attempt, timed, after(600 + ANSWER_GRACE_SECONDS))).toBe(false);
    expect(isAttemptExpired(attempt, timed, after(600 + ANSWER_GRACE_SECONDS + 1))).toBe(true);
  });

  it("never expires an exam that doesn't auto-submit", () => {
    const soft = { timeLimitSeconds: 600, autoSubmitOnExpiry: false };
    expect(isAttemptExpired({ startedAt, extraTimeSeconds: 0 }, soft, after(5000))).toBe(false);
  });

  it("works out the extra time that leaves N minutes from now", () => {
    // 30 minutes in, on a 10-minute exam: 10 more minutes needs 30 + 10 - 10 = 30 minutes extra.
    const extra = extraTimeForMinutesFromNow({ startedAt, extraTimeSeconds: 0 }, timed, 10, after(1800));
    expect(extra).toBe(1800);
    expect(attemptDeadline({ startedAt, extraTimeSeconds: extra }, timed)).toEqual(after(2400));
    // Never takes away extra time that was already given.
    expect(extraTimeForMinutesFromNow({ startedAt, extraTimeSeconds: 5000 }, timed, 1, after(60))).toBe(5000);
  });
});

const live: SnapshotSource = {
  prompt: "2 + 2?",
  type: "MCQ",
  points: 2,
  explanation: "Basic sum",
  options: [
    { id: "b", label: "5", isCorrect: false, order: 1 },
    { id: "a", label: "4", isCorrect: true, order: 0 },
  ],
};

describe("question snapshots", () => {
  it("keeps options in their saved order", () => {
    expect(buildQuestionSnapshot(live).options.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("uses the snapshot over the question as it is now", () => {
    const snapshot = buildQuestionSnapshot(live);
    const edited: SnapshotSource = {
      ...live,
      prompt: "edited",
      points: 9,
      options: [
        { id: "a", label: "4", isCorrect: false },
        { id: "b", label: "5", isCorrect: true },
      ],
    };
    const resolved = resolveQuestion(snapshot, edited)!;
    expect(resolved.prompt).toBe("2 + 2?");
    expect(resolved.points).toBe(2);
    expect(resolved.options.find((o) => o.id === "a")?.isCorrect).toBe(true);
  });

  it("fills what an old snapshot lacks from the live question", () => {
    const old = { prompt: "How many amps?", type: "NUMERICAL", points: 1, options: [] };
    const resolved = resolveQuestion(old, { ...live, type: "NUMERICAL", numericAnswer: 12, numericUnit: "A" })!;
    expect(resolved.numericAnswer).toBe(12);
    expect(resolved.numericUnit).toBe("A");
    expect(resolved.prompt).toBe("How many amps?");
  });

  it("falls back to the live question, or null when there is neither", () => {
    expect(resolveQuestion(null, live)?.prompt).toBe("2 + 2?");
    expect(resolveQuestion(null, null)).toBeNull();
  });
});

describe("hasAnswerContent", () => {
  it("treats whitespace and empty rows as unanswered", () => {
    expect(hasAnswerContent(null)).toBe(false);
    expect(hasAnswerContent({ selectedOptionIds: [], textAnswer: "   " })).toBe(false);
    expect(hasAnswerContent({ selectedOptionIds: [], textAnswer: "x" })).toBe(true);
    expect(hasAnswerContent({ selectedOptionIds: ["a"], textAnswer: null })).toBe(true);
  });
});

describe("seededShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f"];
  it("gives the same order for the same seed and keeps every item", () => {
    const first = seededShuffle(items, "attempt1:q1");
    expect(seededShuffle(items, "attempt1:q1")).toEqual(first);
    expect([...first].sort()).toEqual(items);
  });
  it("gives different attempts different orders", () => {
    const orders = new Set(Array.from({ length: 12 }, (_, i) => seededShuffle(items, `attempt${i}:q1`).join("")));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("canRevealAnswers", () => {
  const base = {
    showResultsInstantly: true,
    revealAnswersAfterClose: true,
    isLiveExam: false,
    accessClosesAt: null,
    attemptsRemaining: 1,
    hasPassed: false,
  };
  it("never reveals when results are not shown", () => {
    expect(canRevealAnswers({ ...base, showResultsInstantly: false, revealAnswersAfterClose: false })).toBe(false);
  });
  it("reveals straight away when the delay is off", () => {
    expect(canRevealAnswers({ ...base, revealAnswersAfterClose: false })).toBe(true);
  });
  it("waits for a live exam's closing time", () => {
    const closes = new Date("2026-10-12T12:00:00Z");
    const liveExam = { ...base, isLiveExam: true, accessClosesAt: closes, attemptsRemaining: 0 };
    expect(canRevealAnswers({ ...liveExam, now: new Date("2026-10-12T11:59:00Z") })).toBe(false);
    expect(canRevealAnswers({ ...liveExam, now: new Date("2026-10-12T12:00:01Z") })).toBe(true);
  });
  it("without a closing time, waits until the student passed or is out of attempts", () => {
    expect(canRevealAnswers(base)).toBe(false);
    expect(canRevealAnswers({ ...base, hasPassed: true })).toBe(true);
    expect(canRevealAnswers({ ...base, attemptsRemaining: 0 })).toBe(true);
  });
});

describe("typed answers", () => {
  it("normalises Bangla digits, spacing and case", () => {
    expect(normalizeTypedAnswer("  ১২  Volt ")).toBe("12 volt");
  });
  it("accepts a numerical answer typed in Bangla digits", () => {
    const question = { type: "NUMERICAL" as const, points: 1, options: [], numericAnswer: 12.5, numericTolerance: 0 };
    expect(gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "১২.৫" }, 0).isCorrect).toBe(true);
    expect(gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "abc" }, 0).isCorrect).toBe(false);
  });
  it("accepts a fill-in-the-blank answer with extra spaces", () => {
    const question = {
      type: "FILL_IN_BLANK" as const,
      points: 1,
      options: [{ id: "1", label: "New  Delhi", isCorrect: true }],
    };
    expect(gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: " new delhi " }, 0).isCorrect).toBe(true);
  });
});
