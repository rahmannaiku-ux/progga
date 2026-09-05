"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ClipboardPaste, FileSpreadsheet, FileText, FileType, Loader2, Download, Sparkles } from "lucide-react";
import { DraftPreviewList } from "./draft-preview-list";
import {
  parsePastedQuestionsAction,
  parseCsvFileAction,
  parsePdfFileAction,
  parseGoogleDocAction,
  generateQuestionsWithAiAction,
  importParsedQuestions,
  type ImportOutcome,
} from "@/server/actions/question-import-actions";
import { CSV_TEMPLATE_HEADER } from "@/lib/question-import/csv-parser";
import type { ParsedQuestionDraft, QType } from "@/lib/question-import/types";
import type { AiGenerationRequest } from "@/lib/ai/types";

type Tab = "PASTE" | "CSV" | "PDF" | "GOOGLE_DOCS" | "AI";

const TABS: { key: Tab; label: string; icon: typeof ClipboardPaste }[] = [
  { key: "PASTE", label: "Paste text", icon: ClipboardPaste },
  { key: "CSV", label: "CSV", icon: FileSpreadsheet },
  { key: "PDF", label: "PDF", icon: FileText },
  { key: "GOOGLE_DOCS", label: "Google Docs", icon: FileType },
  { key: "AI", label: "AI Generate", icon: Sparkles },
];

const AI_QUESTION_TYPES: (QType | "MIXED")[] = [
  "MIXED",
  "MCQ",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
  "NUMERICAL",
];

export function ImportQuestionsPanel({
  courseId,
  assessmentId,
  isGoogleDocsConfigured,
  googleDocsError,
  googleDocsJustConnected,
  isAiConfigured,
  courseTitle,
}: {
  courseId: string;
  /** Attach imported questions to this exam too, in addition to the bank — same as the manual "Add a question" form. Null = bank-only import (from the dedicated Question Bank page). */
  assessmentId: string | null;
  isGoogleDocsConfigured: boolean;
  googleDocsError?: string;
  googleDocsJustConnected?: boolean;
  isAiConfigured: boolean;
  courseTitle?: string;
}) {
  const [tab, setTab] = useState<Tab>("PASTE");
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fatalRowErrors, setFatalRowErrors] = useState<{ row: number; message: string }[]>([]);
  const [needsOcr, setNeedsOcr] = useState<{ pageCount: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportOutcome | null>(null);
  const [importActionError, setImportActionError] = useState<string | null>(null);
  const [isImporting, startImport] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // --- AI Generate tab state ---
  const [aiTopic, setAiTopic] = useState("");
  const [aiMaterial, setAiMaterial] = useState("");
  const [aiLevel, setAiLevel] = useState("");
  const [aiType, setAiType] = useState<QType | "MIXED">("MIXED");
  const [aiDifficulty, setAiDifficulty] = useState<"EASY" | "MEDIUM" | "HARD" | "MIXED">("MIXED");
  const [aiCount, setAiCount] = useState(10);
  const [aiPoints, setAiPoints] = useState(1);
  const [aiIncludeExplanations, setAiIncludeExplanations] = useState(true);
  const [isGenerating, startGenerate] = useTransition();

  function resetParseState() {
    setParseError(null);
    setFatalRowErrors([]);
    setNeedsOcr(null);
    setImportResult(null);
    setImportActionError(null);
  }

  async function handlePaste() {
    resetParseState();
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const result = await parsePastedQuestionsAction(courseId, pasteText);
      setDrafts(result);
      if (result.length === 0) setParseError("Couldn't find any questions in that text.");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Couldn't parse that text.");
    } finally {
      setParsing(false);
    }
  }

  async function handleCsvFile(file: File) {
    resetParseState();
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await parseCsvFileAction(courseId, form);
      setDrafts(result.drafts);
      setFatalRowErrors(result.fatalRowErrors);
      if (result.drafts.length === 0 && result.fatalRowErrors.length === 0) {
        setParseError("No data rows found in that CSV.");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Couldn't parse that CSV.");
    } finally {
      setParsing(false);
    }
  }

  async function handlePdfFile(file: File) {
    resetParseState();
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await parsePdfFileAction(courseId, form);
      if (result.kind === "text") {
        setDrafts(result.drafts);
        if (result.drafts.length === 0) {
          setParseError("Extracted text from the PDF, but couldn't find question-shaped content in it.");
        }
      } else if (result.kind === "needs-ocr") {
        setNeedsOcr({ pageCount: result.pageCount });
      } else {
        setParseError(result.message);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Couldn't read that PDF.");
    } finally {
      setParsing(false);
    }
  }

  async function handleGoogleDoc() {
    resetParseState();
    if (!docUrl.trim()) return;
    setParsing(true);
    try {
      const result = await parseGoogleDocAction(courseId, docUrl);
      if ("error" in result) {
        setParseError(result.error);
      } else {
        setDrafts(result.drafts);
        if (result.drafts.length === 0) {
          setParseError(`Read "${result.docTitle}", but couldn't find question-shaped content in it.`);
        }
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Couldn't read that document.");
    } finally {
      setParsing(false);
    }
  }

  function handleGenerate() {
    resetParseState();
    if (!aiTopic.trim() && !aiMaterial.trim()) {
      setParseError("Give the AI a topic or paste some source material to generate from.");
      return;
    }
    const request: AiGenerationRequest = {
      topic: aiTopic.trim(),
      sourceMaterial: aiMaterial.trim() || undefined,
      courseTitle,
      level: aiLevel.trim() || undefined,
      questionType: aiType,
      difficulty: aiDifficulty,
      count: aiCount,
      points: aiPoints,
      includeExplanations: aiIncludeExplanations,
    };
    startGenerate(async () => {
      try {
        const result = await generateQuestionsWithAiAction(courseId, request);
        if ("error" in result) {
          setParseError(result.error);
        } else {
          setDrafts(result.drafts);
          if (result.drafts.length === 0) setParseError("The AI didn't return any usable questions. Try again.");
        }
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Generation failed. Please try again.");
      }
    });
  }

  function handleImport() {
    const importable = drafts.filter((d) => !d.parseError);
    if (importable.length === 0) return;
    setImportActionError(null);
    startImport(async () => {
      try {
        const result = await importParsedQuestions(courseId, assessmentId, importable);
        setImportResult(result);
        if (result.imported > 0) {
          // A partial success is the normal case here, not an edge
          // case — importParsedQuestions validates and imports each
          // draft independently. Blanket-removing every submitted
          // draft (the old behavior) silently threw away any that
          // failed server-side re-validation along with the ones that
          // actually succeeded, leaving the mentor no way to fix and
          // resubmit them without regenerating from scratch. Keep
          // exactly the ones that still need fixing: drafts that
          // already had a parseError (never submitted), plus whichever
          // submitted drafts came back in result.failed — tagged with
          // the server's actual error so they display correctly.
          const failureByDraft = new Map(
            result.failed
              .map((f) => [importable[f.index], f.error] as const)
              .filter((entry): entry is [ParsedQuestionDraft, string] => Boolean(entry[0]))
          );
          setDrafts((prev) =>
            prev
              .filter((d) => d.parseError || failureByDraft.has(d))
              .map((d) => (failureByDraft.has(d) ? { ...d, parseError: failureByDraft.get(d)! } : d))
          );
          router.refresh();
        }
      } catch (e) {
        // A transaction failure here means every question in this
        // batch was rolled back together (all-or-nothing, not
        // partial) — nothing in `drafts` should be assumed imported,
        // and the teacher needs to see why before retrying.
        setImportActionError(
          e instanceof Error ? e.message : "Import failed unexpectedly. Please try again."
        );
      }
    });
  }

  const importableCount = drafts.filter((d) => !d.parseError).length;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-border/40 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setDrafts([]);
              resetParseState();
            }}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors " +
              (tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")
            }
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "PASTE" && (
          <div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={"1. What is Ohm's Law?\n\nA. V=IR\nB. P=VI\nC. Q=CV\nD. F=ma\n\nAnswer: A\nMarks: 1"}
              className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 font-mono text-sm text-foreground"
            />
            <button
              type="button"
              onClick={handlePaste}
              disabled={parsing || !pasteText.trim()}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {parsing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Parse questions
            </button>
          </div>
        )}

        {tab === "CSV" && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Columns: {CSV_TEMPLATE_HEADER.join(", ")}. Only "Question" is required — Type is inferred
              if omitted.{" "}
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE_HEADER.join(",") + "\n")}`}
                download="question-import-template.csv"
                className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accent/80"
              >
                <Download className="h-3 w-3" /> Download template
              </a>
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
              disabled={parsing}
              className="text-sm text-foreground"
            />
            {fatalRowErrors.length > 0 && (
              <div className="mt-3 space-y-1 rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
                {fatalRowErrors.map((e, i) => (
                  <p key={i}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "PDF" && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Upload a text-based PDF (question paper, exported document). Scanned/image-only PDFs need OCR — see below.
            </p>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files?.[0] && handlePdfFile(e.target.files[0])}
              disabled={parsing}
              className="text-sm text-foreground"
            />
            {parsing && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting text...
              </p>
            )}
            {needsOcr && (
              <div className="mt-3 rounded-lg border border-xp/40 bg-xp/10 p-3 text-xs text-foreground">
                This looks like a scanned or image-only PDF ({needsOcr.pageCount} page
                {needsOcr.pageCount === 1 ? "" : "s"}, almost no extractable text) — OCR is required, and
                isn't configured on this server yet. Try a text-based PDF, or paste the questions directly
                in the "Paste text" tab instead.
              </div>
            )}
          </div>
        )}

        {tab === "GOOGLE_DOCS" && (
          <div>
            {!isGoogleDocsConfigured ? (
              <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                Google Docs import isn't configured on this server yet (needs GOOGLE_CLIENT_ID,
                GOOGLE_CLIENT_SECRET, and GOOGLE_DOCS_REDIRECT_URI). Ask an admin to set it up.
              </p>
            ) : (
              <div>
                {googleDocsError && (
                  <p className="mb-2 rounded-lg border border-danger/40 bg-danger/5 p-2.5 text-xs text-danger">
                    {googleDocsError}
                  </p>
                )}
                {!googleDocsJustConnected ? (
                  <a
                    href={`/api/mentor/google-docs/connect?returnTo=${encodeURIComponent(pathname)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Connect Google account
                  </a>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="Paste a Google Doc link or ID"
                      className="h-10 min-w-[20rem] flex-1 rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      onClick={handleGoogleDoc}
                      disabled={parsing || !docUrl.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {parsing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Import
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "AI" && (
          <div>
            {!isAiConfigured ? (
              <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                AI question generation isn't configured on this server yet (needs GEMINI_API_KEY). Ask an
                admin to set it up.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Topic</label>
                  <input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g. Kirchhoff's Laws"
                    className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Source material <span className="font-normal text-muted-foreground">(optional — grounds the questions in this text instead of general knowledge)</span>
                  </label>
                  <textarea
                    value={aiMaterial}
                    onChange={(e) => setAiMaterial(e.target.value)}
                    rows={4}
                    placeholder="Paste chapter text, lecture notes, or any reference material..."
                    className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Level</label>
                    <input
                      value={aiLevel}
                      onChange={(e) => setAiLevel(e.target.value)}
                      placeholder="e.g. HSC"
                      className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2.5 text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Type</label>
                    <select
                      value={aiType}
                      onChange={(e) => setAiType(e.target.value as QType | "MIXED")}
                      className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
                    >
                      {AI_QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === "MIXED" ? "Mixed" : t.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Difficulty</label>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value as typeof aiDifficulty)}
                      className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
                    >
                      <option value="MIXED">Mixed</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Number</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={aiCount}
                      onChange={(e) => setAiCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                      className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2.5 text-sm text-foreground"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Marks each
                    <input
                      type="number"
                      min={1}
                      value={aiPoints}
                      onChange={(e) => setAiPoints(Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 w-16 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={aiIncludeExplanations}
                      onChange={(e) => setAiIncludeExplanations(e.target.checked)}
                    />
                    Include explanations
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || (!aiTopic.trim() && !aiMaterial.trim())}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isGenerating ? "Generating..." : "Generate questions"}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  AI-generated questions are never saved automatically — review and edit them below, then
                  import like any other source.
                </p>
              </div>
            )}
          </div>
        )}

        {parseError && <p className="mt-3 text-xs font-semibold text-danger">{parseError}</p>}
      </div>

      {drafts.length > 0 && (
        <div className="mt-5 border-t border-border/40 pt-4">
          <DraftPreviewList drafts={drafts} onChange={setDrafts} />
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || importableCount === 0}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-xp px-4 py-2 text-sm font-bold text-xp-foreground disabled:opacity-50"
          >
            {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {importableCount} question{importableCount === 1 ? "" : "s"}
          </button>
          {importActionError && (
            <p className="mt-2 text-xs font-semibold text-danger">{importActionError}</p>
          )}
        </div>
      )}

      {importResult && (
        <div className="mt-4 rounded-lg border border-border/40 bg-surface p-3 text-xs">
          <p className="font-semibold text-foreground">
            Imported {importResult.imported} question{importResult.imported === 1 ? "" : "s"} into the
            bank{assessmentId ? " and attached to this exam" : ""}.
          </p>
          {importResult.failed.length > 0 && (
            <div className="mt-2 space-y-1 text-danger">
              {importResult.failed.map((f, i) => (
                <p key={i}>
                  "{f.prompt.slice(0, 50)}" — {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
