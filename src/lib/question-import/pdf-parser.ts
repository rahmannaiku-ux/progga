import { parsePastedQuestions } from "./paste-parser";
import type { ParsedQuestionDraft } from "./types";

export type PdfExtractResult =
  | { kind: "text"; drafts: ParsedQuestionDraft[]; extractedText: string; pageCount: number }
  | { kind: "needs-ocr"; pageCount: number; extractedCharCount: number }
  | { kind: "error"; message: string };

// A page with fewer than this many extracted characters is treated as
// "essentially no text" — a scanned/image-only page still occasionally
// yields a handful of stray characters (page numbers, watermark text)
// from a normal text-layer extraction, so the bar is deliberately not
// zero.
const MIN_CHARS_PER_PAGE_FOR_TEXT = 20;

/**
 * Extracts text from an uploaded PDF and runs it through the SAME
 * block parser as paste-import — a question paper's text, once pulled
 * out of the PDF, has the same "1. prompt / A. option / Answer: X"
 * shape a teacher would type directly, so there's no separate PDF-
 * specific question-detection logic to maintain.
 *
 * Deliberately does NOT attempt OCR itself. If the extracted text is
 * far too short for the page count, this returns a "needs-ocr" result
 * instead of silently returning an empty/garbage question list — see
 * ocr.ts for why OCR is a clearly separate, currently-unconfigured path
 * rather than something faked here.
 */
export async function extractQuestionsFromPdf(buffer: Buffer): Promise<PdfExtractResult> {
  let pdfParse: (b: Buffer) => Promise<{ text: string; numpages: number }>;
  try {
    // Lazy require — pdf-parse has a debug-mode side effect on import
    // in some versions when run outside its own test harness; deferring
    // the import to inside the function (only reached when a PDF is
    // actually uploaded) avoids paying that cost for every request that
    // never touches PDF import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParse = require("pdf-parse");
  } catch {
    return {
      kind: "error",
      message: "PDF parsing isn't available on this server (pdf-parse isn't installed). Run `npm install`.",
    };
  }

  let result: { text: string; numpages: number };
  try {
    result = await pdfParse(buffer);
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? `Couldn't read this PDF: ${err.message}` : "Couldn't read this PDF.",
    };
  }

  const text = result.text.trim();
  const pageCount = result.numpages || 1;

  if (text.length < MIN_CHARS_PER_PAGE_FOR_TEXT * pageCount) {
    return { kind: "needs-ocr", pageCount, extractedCharCount: text.length };
  }

  const drafts = parsePastedQuestions(text);
  return { kind: "text", drafts, extractedText: text, pageCount };
}
