import { emptyDraft, type ParsedQuestionDraft, type QType } from "./types";

/**
 * Documented expected columns (header names are case-insensitive,
 * order doesn't matter, unknown extra columns are ignored):
 *
 *   Question        (required)
 *   Type             (optional — MCQ/MULTIPLE_SELECT/TRUE_FALSE/FILL_IN_BLANK/
 *                      SHORT_ANSWER/ESSAY/NUMERICAL; inferred from Option
 *                      columns if omitted)
 *   Option A..Option F  (up to 6 — omit unused ones)
 *   Correct Answer   (required for MCQ/MULTIPLE_SELECT/TRUE_FALSE/
 *                      FILL_IN_BLANK/NUMERICAL — letter(s) e.g. "A" or
 *                      "A,C" for choice types, "True"/"False", a number,
 *                      or the literal acceptable text for FILL_IN_BLANK)
 *   Marks            (optional, default 1)
 *   Difficulty       (optional — Easy/Medium/Hard, default Medium)
 *   Topic            (optional)
 *   Tags             (optional, semicolon or comma separated)
 *   Explanation      (optional)
 *   Tolerance        (optional, NUMERICAL only, default 0)
 *   Unit             (optional, NUMERICAL only)
 */
export const CSV_TEMPLATE_HEADER = [
  "Question",
  "Type",
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Correct Answer",
  "Marks",
  "Difficulty",
  "Topic",
  "Tags",
  "Explanation",
];

export type CsvParseResult = {
  drafts: ParsedQuestionDraft[];
  /** Row-level errors that prevented a row becoming a draft at all (e.g. missing Question column) — reported with 1-based row numbers matching what a teacher sees in a spreadsheet. */
  fatalRowErrors: { row: number; message: string }[];
};

/**
 * Minimal RFC4180-ish CSV parser (handles quoted fields containing
 * commas/newlines/escaped quotes) — hand-rolled rather than adding a
 * dependency, since the only consumer is this one importer and the
 * format teachers export from Excel/Sheets is well-behaved standard CSV.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Last field/row (files not always newline-terminated).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseCsvQuestions(text: string): CsvParseResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { drafts: [], fatalRowErrors: [] };

  const header = (rows[0] ?? []).map(normalizeHeader);
  const col = (name: string) => header.indexOf(normalizeHeader(name));

  const idx = {
    question: col("question"),
    type: col("type"),
    marks: col("marks") !== -1 ? col("marks") : col("points"),
    correct: col("correct answer") !== -1 ? col("correct answer") : col("answer"),
    difficulty: col("difficulty"),
    topic: col("topic"),
    tags: col("tags"),
    explanation: col("explanation"),
    tolerance: col("tolerance"),
    unit: col("unit"),
    options: [0, 1, 2, 3, 4, 5]
      .map((i) => col(`option ${String.fromCharCode(65 + i)}`))
      .filter((i) => i !== -1),
  };

  if (idx.question === -1) {
    return {
      drafts: [],
      fatalRowErrors: [
        { row: 1, message: 'No "Question" column found in the header row — see the template for expected columns.' },
      ],
    };
  }

  const drafts: ParsedQuestionDraft[] = [];
  const fatalRowErrors: CsvParseResult["fatalRowErrors"] = [];

  for (let r = 1; r < rows.length; r++) {
    const rowNum = r + 1; // 1-based, matches a spreadsheet's row numbers including the header
    // Guaranteed defined by the loop bound (r < rows.length), but
    // noUncheckedIndexedAccess doesn't know that — the `?? []` fallback
    // is purely to satisfy the type checker; get() below handles an
    // empty array correctly regardless.
    const cells = rows[r] ?? [];
    const get = (i: number) => (i >= 0 && i < cells.length ? (cells[i] ?? "").trim() : "");

    const prompt = get(idx.question);
    if (!prompt) {
      fatalRowErrors.push({ row: rowNum, message: "Missing question text." });
      continue;
    }

    const optionLabels = idx.options.map((i) => get(i)).filter((v) => v.length > 0);
    const marksRaw = get(idx.marks);
    const points = marksRaw && !isNaN(Number(marksRaw)) ? Number(marksRaw) : 1;
    const difficultyRaw = get(idx.difficulty).toUpperCase();
    const difficulty: ParsedQuestionDraft["difficulty"] =
      difficultyRaw === "EASY" || difficultyRaw === "HARD" ? difficultyRaw : "MEDIUM";
    const topic = get(idx.topic);
    const tags = get(idx.tags)
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const explanation = get(idx.explanation);
    const correctRaw = get(idx.correct);
    const typeRaw = get(idx.type).toUpperCase().replace(/[\s-]/g, "_");

    const explicitType: QType | null = (
      ["MCQ", "MULTIPLE_SELECT", "TRUE_FALSE", "FILL_IN_BLANK", "SHORT_ANSWER", "ESSAY", "NUMERICAL"] as const
    ).includes(typeRaw as QType)
      ? (typeRaw as QType)
      : null;

    const warnings: string[] = [];
    let type: QType;
    let options: { label: string; isCorrect: boolean }[] = [];
    let numericAnswer: number | undefined;
    let numericTolerance = 0;
    let numericUnit = "";
    let parseError: string | null = null;

    if (explicitType) {
      type = explicitType;
    } else if (optionLabels.length >= 2) {
      type = "MCQ"; // refined to MULTIPLE_SELECT below if the answer has 2+ letters
    } else if (optionLabels.length === 1) {
      // Exactly one Option column filled with no explicit Type is
      // ambiguous — most likely a choice question the teacher forgot to
      // finish filling in, not a deliberate single-option question type.
      // Flagged rather than silently reinterpreted as something else
      // (e.g. it would otherwise fall through to "has a Correct Answer
      // value" and get misread as SHORT_ANSWER).
      type = "MCQ";
      parseError = 'Only one "Option" column is filled in — choice questions need at least two, or set Type explicitly.';
    } else if (/^(true|false)$/i.test(correctRaw)) {
      type = "TRUE_FALSE";
    } else if (correctRaw && /^-?\d+(\.\d+)?$/.test(correctRaw)) {
      type = "NUMERICAL";
    } else if (correctRaw) {
      type = "SHORT_ANSWER";
    } else {
      type = "MCQ";
      warnings.push("Couldn't infer a question type from this row — defaulted to MCQ; please review.");
    }

    if (!parseError && (type === "MCQ" || type === "MULTIPLE_SELECT" || type === "TRUE_FALSE" || type === "FILL_IN_BLANK")) {
      const labels = type === "TRUE_FALSE" ? ["True", "False"] : optionLabels;
      if (type !== "TRUE_FALSE" && type !== "FILL_IN_BLANK" && labels.length < 2) {
        parseError = "Choice questions need at least two Option columns filled in.";
      } else if (type === "FILL_IN_BLANK" && labels.length < 1) {
        parseError = "Fill-in-the-blank needs at least one Option column as an acceptable answer.";
      } else if (type === "FILL_IN_BLANK") {
        options = labels.map((label) => ({ label, isCorrect: true }));
      } else {
        const letters = correctRaw
          .toUpperCase()
          .split(/[,\s&]+|and/i)
          .map((s) => s.trim())
          .filter((s) => /^[A-Z]$/.test(s));
        const letterIndex = (l: string) => l.charCodeAt(0) - 65;
        const validIndexes = letters.map(letterIndex).filter((i) => i >= 0 && i < labels.length);

        if (type === "TRUE_FALSE") {
          const isTrue = /^true$/i.test(correctRaw);
          options = [
            { label: "True", isCorrect: isTrue },
            { label: "False", isCorrect: !isTrue },
          ];
        } else if (validIndexes.length === 0) {
          warnings.push(`Couldn't match "Correct Answer" value "${correctRaw}" to an option letter — defaulted to Option A.`);
          options = labels.map((label, i) => ({ label, isCorrect: i === 0 }));
        } else {
          options = labels.map((label, i) => ({ label, isCorrect: validIndexes.includes(i) }));
          if (validIndexes.length > 1 && type === "MCQ") type = "MULTIPLE_SELECT";
        }
      }
    } else if (type === "NUMERICAL") {
      if (!correctRaw || isNaN(Number(correctRaw))) {
        parseError = 'Numerical questions need a numeric value in "Correct Answer".';
      } else {
        numericAnswer = Number(correctRaw);
        const tolRaw = get(idx.tolerance);
        numericTolerance = tolRaw && !isNaN(Number(tolRaw)) ? Number(tolRaw) : 0;
        numericUnit = get(idx.unit);
      }
    } else if (type === "SHORT_ANSWER" && correctRaw) {
      // Reference answer isn't graded automatically for this type — carried into the explanation so it isn't lost.
      warnings.push('"Correct Answer" for short-answer questions is shown as a grading hint, not auto-graded.');
    }

    drafts.push(
      emptyDraft({
        type,
        prompt,
        points,
        difficulty,
        topic,
        tags,
        explanation: explanation || (type === "SHORT_ANSWER" && correctRaw ? `Suggested answer: ${correctRaw}` : ""),
        options,
        numericAnswer,
        numericTolerance,
        numericUnit,
        warnings,
        parseError,
        sourceText: cells.join(", "),
      })
    );
  }

  return { drafts, fatalRowErrors };
}
