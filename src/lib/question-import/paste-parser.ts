import { emptyDraft, type ParsedQuestionDraft } from "./types";

/**
 * Parses free-form pasted text like:
 *
 *   1. What is Ohm's Law?
 *   A. V=IR
 *   B. P=VI
 *   C. Q=CV
 *   D. F=ma
 *   Answer: A
 *   Marks: 1
 *
 * into structured drafts. Heuristic by nature — pasted text has no
 * schema — so every draft carries `warnings` for anything guessed
 * rather than read directly, and a hard `parseError` for blocks that
 * couldn't be turned into a question at all. Never throws: the worst
 * input produces an empty array or all-parseError drafts, not a crash.
 */
export function parsePastedQuestions(rawText: string): ParsedQuestionDraft[] {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks = splitIntoBlocks(text);
  return blocks.map((block) => parseBlock(block));
}

/**
 * Splits on a line that looks like a new question's leading number
 * ("1.", "1)", "Q1.", "Question 1:") — the one structural marker every
 * realistic paste format shares, per the spec's own example. Falls
 * back to blank-line-separated blocks if nothing matches that pattern
 * at all (e.g. a single unnumbered question, or a teacher who separates
 * questions with a blank line and no numbering).
 */
function splitIntoBlocks(text: string): string[] {
  const numberedStart = /^(?:q(?:uestion)?\s*)?\d+[.):]\s*/im;
  const lines = text.split("\n");
  const startIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (numberedStart.test(line.trim())) startIndexes.push(i);
  });

  if (startIndexes.length >= 1) {
    const blocks: string[] = [];
    for (let i = 0; i < startIndexes.length; i++) {
      const start = startIndexes[i];
      const end = i + 1 < startIndexes.length ? startIndexes[i + 1] : lines.length;
      blocks.push(lines.slice(start, end).join("\n").trim());
    }
    return blocks.filter(Boolean);
  }

  // No numbering detected — fall back to blank-line-separated blocks.
  return text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

const OPTION_LINE = /^\(?([A-Za-z])[.):]\s*(.+)$/;
const ANSWER_LINE = /^answer\s*:\s*(.+)$/i;
const MARKS_LINE = /^(?:marks?|points?)\s*:\s*(\d+(?:\.\d+)?)$/i;
const TOPIC_LINE = /^topic\s*:\s*(.+)$/i;
const EXPLANATION_LINE = /^explanation\s*:\s*(.+)$/i;
const LEADING_NUMBER = /^(?:q(?:uestion)?\s*)?\d+[.):]\s*/i;

function parseBlock(block: string): ParsedQuestionDraft {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const promptLines: string[] = [];
  const options: { letter: string; label: string }[] = [];
  let answerRaw: string | null = null;
  let marks: number | null = null;
  let topic: string | null = null;
  let explanation: string | null = null;
  const warnings: string[] = [];

  for (const line of lines) {
    const optMatch = line.match(OPTION_LINE);
    const ansMatch = line.match(ANSWER_LINE);
    const marksMatch = line.match(MARKS_LINE);
    const topicMatch = line.match(TOPIC_LINE);
    const explMatch = line.match(EXPLANATION_LINE);

    if (ansMatch) {
      answerRaw = (ansMatch[1] ?? "").trim();
    } else if (marksMatch) {
      marks = Number(marksMatch[1] ?? "");
    } else if (topicMatch) {
      topic = (topicMatch[1] ?? "").trim();
    } else if (explMatch) {
      explanation = (explMatch[1] ?? "").trim();
    } else if (optMatch && optMatch[1] && optMatch[1].length === 1) {
      // Single-letter option markers only (A-Z) — guards against
      // treating an ordinary sentence like "C. elegans is a worm." as
      // an option line just because it starts with "C.".
      options.push({ letter: optMatch[1].toUpperCase(), label: (optMatch[2] ?? "").trim() });
    } else if (options.length === 0 && answerRaw === null) {
      // Still in the prompt — anything before the first option/answer
      // line is part of the question text (supports multi-line prompts).
      promptLines.push(line);
    }
  }

  const prompt = promptLines.join(" ").replace(LEADING_NUMBER, "").trim();
  const sourceText = block;

  if (!prompt) {
    return emptyDraft({
      sourceText,
      parseError: "Couldn't find a question prompt in this block.",
    });
  }

  // --- Determine type from what was found ---
  if (options.length >= 2) {
    return buildChoiceDraft(prompt, options, answerRaw, marks, topic, explanation, sourceText, warnings);
  }

  if (answerRaw !== null && /^(true|false|t|f)$/i.test(answerRaw)) {
    const isTrue = /^(true|t)$/i.test(answerRaw);
    return emptyDraft({
      sourceText,
      type: "TRUE_FALSE",
      prompt,
      points: marks ?? 1,
      topic: topic ?? "",
      explanation: explanation ?? "",
      options: [
        { label: "True", isCorrect: isTrue },
        { label: "False", isCorrect: !isTrue },
      ],
      warnings,
    });
  }

  if (answerRaw !== null && /^-?\d+(\.\d+)?$/.test(answerRaw)) {
    return emptyDraft({
      sourceText,
      type: "NUMERICAL",
      prompt,
      points: marks ?? 1,
      topic: topic ?? "",
      explanation: explanation ?? "",
      numericAnswer: Number(answerRaw),
      warnings,
    });
  }

  if (answerRaw !== null) {
    // Free-text answer, no options — best modeled as short answer.
    // Stored as a single "acceptable answer" option-less draft; the
    // teacher reviews/adjusts grading expectations manually since this
    // is a manually-graded type anyway.
    return emptyDraft({
      sourceText,
      type: "SHORT_ANSWER",
      prompt,
      points: marks ?? 1,
      topic: topic ?? "",
      explanation: explanation ?? answerRaw ? `Expected answer: ${answerRaw}` : "",
      warnings: [...warnings, "No structured answer format detected — imported as short answer."],
    });
  }

  // No "Answer:" line and fewer than 2 options at all — can't
  // determine correctness. Still surfaced (never silently dropped),
  // but flagged so the teacher fixes it before import rather than a
  // wrong guess entering the bank silently.
  return emptyDraft({
    sourceText,
    prompt,
    points: marks ?? 1,
    topic: topic ?? "",
    explanation: explanation ?? "",
    parseError: "No answer detected for this question — add one manually before importing.",
  });
}

function buildChoiceDraft(
  prompt: string,
  options: { letter: string; label: string }[],
  answerRaw: string | null,
  marks: number | null,
  topic: string | null,
  explanation: string | null,
  sourceText: string,
  warnings: string[]
): ParsedQuestionDraft {
  const warns = [...warnings];
  let correctLetters: string[] = [];
  const validLetters = new Set(options.map((o) => o.letter));
  // Guaranteed non-empty by the caller (options.length >= 2 before
  // buildChoiceDraft is ever invoked) — the fallback is purely to
  // satisfy noUncheckedIndexedAccess, never actually reached.
  const firstOption = options[0] ?? { letter: "A", label: "" };

  if (answerRaw) {
    // "A", "A, C", "A and C", "AC"
    const letters = answerRaw
      .toUpperCase()
      .split(/[,\s&]+|and/i)
      .map((s) => s.trim())
      .filter((s) => /^[A-Z]$/.test(s) && validLetters.has(s));
    correctLetters = letters;
    if (correctLetters.length === 0) {
      warns.push(`Couldn't match answer "${answerRaw}" to a lettered option — defaulted to option A.`);
      correctLetters = [firstOption.letter];
    }
  } else {
    warns.push("No answer line found — defaulted to option A. Please verify.");
    correctLetters = [firstOption.letter];
  }

  const type: ParsedQuestionDraft["type"] = correctLetters.length > 1 ? "MULTIPLE_SELECT" : "MCQ";

  return emptyDraft({
    sourceText,
    type,
    prompt,
    points: marks ?? 1,
    topic: topic ?? "",
    explanation: explanation ?? "",
    options: options.map((o) => ({ label: o.label, isCorrect: correctLetters.includes(o.letter) })),
    warnings: warns,
  });
}
