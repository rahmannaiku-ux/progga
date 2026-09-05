/**
 * OCR path for image-only PDFs (scanned question papers, photographed
 * textbook pages) — deliberately isolated here as its own module,
 * SEPARATE from pdf-parser.ts's plain text extraction, rather than
 * pretending pdf-parse's text extraction ("if it doesn't find text,
 * just try harder") could ever handle a scanned image. It can't: there
 * is no text layer to try harder on.
 *
 * NOT IMPLEMENTED — no OCR provider is configured in this project.
 * Wiring this up is a deliberate, separate decision (which OCR engine —
 * a hosted API like Google Cloud Vision/Textract, or a self-hosted
 * option like Tesseract — has real cost/accuracy/latency tradeoffs
 * worth choosing explicitly, not defaulting into). The PDF import UI
 * checks for this via `isOcrConfigured()` and shows a clear "OCR isn't
 * set up yet" state instead of a silent failure or empty result — see
 * the "needs-ocr" branch in pdf-parser.ts and the import page.
 */
export function isOcrConfigured(): boolean {
  return Boolean(process.env.OCR_PROVIDER);
}

export async function extractTextViaOcr(_buffer: Buffer): Promise<string> {
  throw new Error(
    "OCR is not configured on this server. Set OCR_PROVIDER (and its credentials) to enable image-only PDF import."
  );
}
