import { describe, it, expect } from "vitest";
import {
  isAutoGradable,
  gradeAutoGradableQuestion,
  summarizeAttemptScore,
  isPassing,
  type GradableQuestion,
} from "@/lib/grading";

describe("isAutoGradable", () => {
  it("returns true for MCQ, MULTIPLE_SELECT, TRUE_FALSE, FILL_IN_BLANK, NUMERICAL", () => {
    expect(isAutoGradable("MCQ")).toBe(true);
    expect(isAutoGradable("MULTIPLE_SELECT")).toBe(true);
    expect(isAutoGradable("TRUE_FALSE")).toBe(true);
    expect(isAutoGradable("FILL_IN_BLANK")).toBe(true);
    expect(isAutoGradable("NUMERICAL")).toBe(true);
  });

  it("returns false for SHORT_ANSWER and ESSAY", () => {
    expect(isAutoGradable("SHORT_ANSWER")).toBe(false);
    expect(isAutoGradable("ESSAY")).toBe(false);
  });
});

describe("gradeAutoGradableQuestion — MCQ", () => {
  const question: GradableQuestion = {
    type: "MCQ",
    points: 10,
    options: [
      { id: "a", label: "Correct", isCorrect: true },
      { id: "b", label: "Wrong 1", isCorrect: false },
      { id: "c", label: "Wrong 2", isCorrect: false },
    ],
  };

  it("awards full points for the correct option", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: ["a"], textAnswer: null }, 0);
    expect(result).toEqual({ isCorrect: true, pointsAwarded: 10 });
  });

  it("awards zero (no negative marking) for a wrong option", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: ["b"], textAnswer: null }, 0);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("applies negative marking only when an answer was actually given", () => {
    const wrong = gradeAutoGradableQuestion(question, { selectedOptionIds: ["b"], textAnswer: null }, 0.25);
    expect(wrong).toEqual({ isCorrect: false, pointsAwarded: -2.5 });

    const unanswered = gradeAutoGradableQuestion(question, null, 0.25);
    expect(unanswered).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("treats an empty selection as unanswered, not a wrong attempt", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: null }, 0.5);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });
});

describe("gradeAutoGradableQuestion — MULTIPLE_SELECT", () => {
  const question: GradableQuestion = {
    type: "MULTIPLE_SELECT",
    points: 4,
    options: [
      { id: "a", label: "A", isCorrect: true },
      { id: "b", label: "B", isCorrect: true },
      { id: "c", label: "C", isCorrect: false },
    ],
  };

  it("requires an exact match of all correct options, nothing more", () => {
    const exact = gradeAutoGradableQuestion(question, { selectedOptionIds: ["a", "b"], textAnswer: null }, 0);
    expect(exact.isCorrect).toBe(true);

    const partial = gradeAutoGradableQuestion(question, { selectedOptionIds: ["a"], textAnswer: null }, 0);
    expect(partial.isCorrect).toBe(false);

    const tooMany = gradeAutoGradableQuestion(
      question,
      { selectedOptionIds: ["a", "b", "c"], textAnswer: null },
      0
    );
    expect(tooMany.isCorrect).toBe(false);
  });

  it("order of selected options doesn't matter", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: ["b", "a"], textAnswer: null }, 0);
    expect(result.isCorrect).toBe(true);
  });
});

describe("gradeAutoGradableQuestion — FILL_IN_BLANK", () => {
  const question: GradableQuestion = {
    type: "FILL_IN_BLANK",
    points: 5,
    options: [
      { id: "a", label: "npm run dev", isCorrect: true },
      { id: "b", label: "yarn dev", isCorrect: true },
    ],
  };

  it("matches case-insensitively and trims whitespace", () => {
    const result = gradeAutoGradableQuestion(
      question,
      { selectedOptionIds: [], textAnswer: "  NPM RUN DEV  " },
      0
    );
    expect(result.isCorrect).toBe(true);
  });

  it("accepts any one of multiple acceptable answers", () => {
    const result = gradeAutoGradableQuestion(
      question,
      { selectedOptionIds: [], textAnswer: "yarn dev" },
      0
    );
    expect(result.isCorrect).toBe(true);
  });

  it("rejects an empty answer without treating it as a wrong attempt for negative marking", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "" }, 0.5);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("applies negative marking to a genuinely wrong text answer", () => {
    const result = gradeAutoGradableQuestion(
      question,
      { selectedOptionIds: [], textAnswer: "node dev.js" },
      0.2
    );
    expect(result).toEqual({ isCorrect: false, pointsAwarded: -1 });
  });
});

describe("gradeAutoGradableQuestion — NUMERICAL", () => {
  const question: GradableQuestion = {
    type: "NUMERICAL",
    points: 5,
    options: [],
    numericAnswer: 4.5,
    numericTolerance: 0.1,
  };

  it("awards full points for an exact match", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "4.5" }, 0);
    expect(result).toEqual({ isCorrect: true, pointsAwarded: 5 });
  });

  it("accepts any value within tolerance", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "4.55" }, 0);
    expect(result.isCorrect).toBe(true);
  });

  it("rejects a value outside tolerance", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "4.7" }, 0);
    expect(result.isCorrect).toBe(false);
  });

  it("treats a non-numeric answer as incorrect, not a crash", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "not-a-number" }, 0);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("treats an empty answer as unanswered, not a wrong attempt", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "" }, 0.5);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("applies negative marking to a genuinely wrong numeric answer", () => {
    const result = gradeAutoGradableQuestion(question, { selectedOptionIds: [], textAnswer: "4.7" }, 0.2);
    expect(result).toEqual({ isCorrect: false, pointsAwarded: -1 });
  });

  it("never marks correct if the question has no reference answer set", () => {
    const noAnswer: GradableQuestion = { type: "NUMERICAL", points: 3, options: [], numericAnswer: undefined };
    const result = gradeAutoGradableQuestion(noAnswer, { selectedOptionIds: [], textAnswer: "5" }, 0);
    expect(result.isCorrect).toBe(false);
  });
});

describe("summarizeAttemptScore", () => {
  it("floors the total at zero even when negative marking pushes it below", () => {
    const { rawScore, maxScore, percentage } = summarizeAttemptScore([
      { pointsAwarded: -5, questionPoints: 10 },
      { pointsAwarded: -5, questionPoints: 10 },
      { pointsAwarded: 2, questionPoints: 10 },
    ]);
    expect(rawScore).toBe(0);
    expect(maxScore).toBe(30);
    expect(percentage).toBe(0);
  });

  it("computes percentage correctly for a normal mixed result", () => {
    const { rawScore, maxScore, percentage } = summarizeAttemptScore([
      { pointsAwarded: 10, questionPoints: 10 },
      { pointsAwarded: 0, questionPoints: 10 },
      { pointsAwarded: 5, questionPoints: 10 },
    ]);
    expect(rawScore).toBe(15);
    expect(maxScore).toBe(30);
    expect(percentage).toBe(50);
  });

  it("returns 0% for an assessment with zero max score instead of dividing by zero", () => {
    const { percentage } = summarizeAttemptScore([]);
    expect(percentage).toBe(0);
  });
});

describe("isPassing", () => {
  it("passes when percentage meets or exceeds the pass mark", () => {
    expect(isPassing(70, 70)).toBe(true);
    expect(isPassing(71, 70)).toBe(true);
  });

  it("fails when percentage is below the pass mark", () => {
    expect(isPassing(69, 70)).toBe(false);
  });
});
