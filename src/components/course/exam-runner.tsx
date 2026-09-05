"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveAnswer,
  recordTabSwitch,
  submitAttempt,
  toggleMarkForReview,
  recordQuestionTime,
  recordFullscreenChange,
  recordWindowFocusChange,
  recordClipboardEvent,
  recordScreenshotAttempt,
  recordConnectionEvent,
  checkSessionFingerprint,
} from "@/server/actions/attempt-actions";
import { Button } from "@/components/ui/button";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { ExamWatermark } from "@/components/exam/exam-watermark";

type Option = { id: string; label: string };
type Question = {
  id: string;
  type: "MCQ" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "FILL_IN_BLANK" | "SHORT_ANSWER" | "ESSAY" | "NUMERICAL";
  prompt: string;
  points: number;
  options: Option[];
  numericUnit?: string | null;
};
type SavedAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  markedForReview?: boolean;
  isLocked?: boolean;
};

// How often accumulated per-question view time is flushed to the
// server — see recordQuestionTime()'s "not per keystroke" comment.
// Tuned to keep write volume low on a long exam per PHASE 24.
const TIME_FLUSH_INTERVAL_MS = 15_000;
const SESSION_CHECK_INTERVAL_MS = 45_000;

export function ExamRunner({
  attemptId,
  studentName,
  examTitle,
  questions,
  savedAnswers,
  timeLimitSeconds,
  startedAt,
  autoSubmitOnExpiry,
  fullscreenRequired,
  tabSwitchDetection,
  lockAnswersAfterSelection = false,
  detectCopyPaste = false,
  detectScreenshotAttempts = false,
  detectSessionAnomalies = false,
}: {
  attemptId: string;
  studentName: string;
  examTitle: string;
  questions: Question[];
  savedAnswers: SavedAnswer[];
  timeLimitSeconds: number | null;
  startedAt: string;
  autoSubmitOnExpiry: boolean;
  fullscreenRequired: boolean;
  tabSwitchDetection: boolean;
  lockAnswersAfterSelection?: boolean;
  detectCopyPaste?: boolean;
  detectScreenshotAttempts?: boolean;
  detectSessionAnomalies?: boolean;
}) {
  const router = useRouter();
  const answerMap = new Map(savedAnswers.map((a) => [a.questionId, a]));

  const [answers, setAnswers] = useState<Record<string, { selectedOptionIds: string[]; textAnswer: string }>>(
    () =>
      Object.fromEntries(
        questions.map((q) => {
          const saved = answerMap.get(q.id);
          return [
            q.id,
            {
              selectedOptionIds: saved?.selectedOptionIds ?? [],
              textAnswer: saved?.textAnswer ?? "",
            },
          ];
        })
      )
  );

  // Locked state is server-authoritative — seeded from savedAnswers on
  // load (a refresh must keep an answer locked, see PHASE 25 "Refresh
  // persists"), then updated optimistically the moment a select-type
  // answer is chosen under a locking exam. saveAnswer() is still the
  // real enforcement point; this only drives the disabled UI state.
  const [locked, setLocked] = useState<Set<string>>(
    () => new Set(savedAnswers.filter((a) => a.isLocked).map((a) => a.questionId))
  );
  const [lockToast, setLockToast] = useState<string | null>(null);

  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!timeLimitSeconds) return null;
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, timeLimitSeconds - elapsed);
  });
  const [submitting, setSubmitting] = useState(false);
  const [tabWarning, setTabWarning] = useState<string | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [contentHidden, setContentHidden] = useState(false);
  const [sessionAnomaly, setSessionAnomaly] = useState(false);
  const [offline, setOffline] = useState(false);
  // Mark-for-review is now server-persisted (PHASE 4/16) — seeded from
  // savedAnswers, kept in sync via toggleMarkForReview.
  const [marked, setMarked] = useState<Set<string>>(
    () => new Set(savedAnswers.filter((a) => a.markedForReview).map((a) => a.questionId))
  );
  const hasSubmitted = useRef(false);

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    return (a?.selectedOptionIds.length ?? 0) > 0 || (a?.textAnswer.trim().length ?? 0) > 0;
  }).length;
  const unansweredCount = questions.length - answeredCount;

  async function doSubmit(disqualified = false) {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    setSubmitting(true);
    await flushPendingSaves(); // don't grade before the last debounced keystrokes land
    await submitAttempt(attemptId, disqualified ? { disqualified: true } : undefined);
    router.refresh();
  }

  // Timer / auto-submit
  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      if (autoSubmitOnExpiry) doSubmit();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r !== null ? r - 1 : r)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // Fullscreen enforcement (PHASE 7) — requests fullscreen, and now
  // also listens for the browser's own fullscreenchange event so an
  // exit is detected even when it didn't go through this component
  // (Esc key, browser chrome, etc.), logs it, and applies whatever
  // fullscreenExitAction the teacher configured.
  useEffect(() => {
    if (!fullscreenRequired) return;
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});

    function onFullscreenChange() {
      const entered = Boolean(document.fullscreenElement);
      recordFullscreenChange(attemptId, entered).then((res) => {
        if (!res) return;
        if (res.action === "disqualified") {
          setTabWarning("Fullscreen was exited — this attempt has been submitted.");
          router.refresh();
        } else if (res.action === "flagged") {
          setTabWarning("Fullscreen exit recorded for teacher review.");
        } else if (res.action === "warning") {
          setTabWarning("Please stay in fullscreen for this exam.");
          if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        }
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [fullscreenRequired, attemptId, router]);

  // Tab-switch detection (PHASE 6)
  useEffect(() => {
    if (!tabSwitchDetection) return;
    function onVisibilityChange() {
      if (document.hidden) {
        recordTabSwitch(attemptId).then((res) => {
          if (!res) return;
          if (res.disqualified) {
            setTabWarning("Too many tab switches — this attempt has been submitted.");
            router.refresh();
          } else {
            setTabWarning(
              `Tab switch detected (${res.tabSwitchCount}). Repeated switches will end your attempt.`
            );
          }
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [tabSwitchDetection, attemptId, router]);

  // Window blur/focus (PHASE 6, finer-grained than tab-switch above) —
  // always tracked, independent of tabSwitchDetection, since this is
  // purely informational for the timeline and never disqualifying.
  useEffect(() => {
    const onBlur = () => recordWindowFocusChange(attemptId, false);
    const onFocus = () => recordWindowFocusChange(attemptId, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [attemptId]);

  // Content obfuscation while the page is hidden (PHASE 11) — separate
  // from tab-switch counting above (which only fires when
  // tabSwitchDetection is on). This overlay always applies, regardless
  // of that setting, and never touches answer state.
  useEffect(() => {
    function onVisibility() {
      setContentHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Connection tracking (PHASE 12) — timeline-only, never punitive.
  useEffect(() => {
    function onOffline() {
      setOffline(true);
      recordConnectionEvent(attemptId, false);
    }
    function onOnline() {
      setOffline(false);
      recordConnectionEvent(attemptId, true);
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [attemptId]);

  // Session anomaly polling (PHASE 13) — lightweight, low-frequency,
  // and only ever shows a review banner; never disqualifies by itself.
  useEffect(() => {
    if (!detectSessionAnomalies) return;
    const i = setInterval(() => {
      checkSessionFingerprint(attemptId).then((res) => {
        if (res?.anomaly) setSessionAnomaly(true);
      });
    }, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(i);
  }, [detectSessionAnomalies, attemptId]);

  // Copy / paste / cut detection (PHASE 8) — logged only, never blocked.
  useEffect(() => {
    if (!detectCopyPaste) return;
    const onCopy = () => recordClipboardEvent(attemptId, "COPY");
    const onPaste = () => recordClipboardEvent(attemptId, "PASTE");
    const onCut = () => recordClipboardEvent(attemptId, "CUT");
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
    };
  }, [detectCopyPaste, attemptId]);

  // Screenshot deterrence (PHASE 9) — best-practical browser-level
  // measures only. A website cannot actually prevent a screenshot
  // (e.g. a second camera photographing the screen); this only blocks
  // the easy in-browser paths and logs what it can detect.
  useEffect(() => {
    if (!detectScreenshotAttempts) return;
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    function onDragStart(e: DragEvent) {
      e.preventDefault();
    }
    function onKeyDown(e: KeyboardEvent) {
      // PrintScreen fires a keydown in most browsers; the OS-level
      // capture itself can't be prevented, only detected after the fact.
      if (e.key === "PrintScreen") {
        recordScreenshotAttempt(attemptId, "print_screen_key");
      }
      // Common OS/browser screenshot & devtools shortcuts — detectable,
      // not preventable at the OS level, so these are logged, and the
      // devtools ones are also blocked since they're in-page shortcuts.
      const isSnipShortcut =
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) || // macOS
        (e.metaKey && e.shiftKey && e.key.toLowerCase() === "s"); // Windows Snip & Sketch
      if (isSnipShortcut) {
        recordScreenshotAttempt(attemptId, "os_snip_shortcut");
      }
      const isDevtoolsShortcut =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase()));
      if (isDevtoolsShortcut) {
        recordScreenshotAttempt(attemptId, "devtools_shortcut");
        e.preventDefault();
      }
    }
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [detectScreenshotAttempts, attemptId]);

  // Per-question time tracking (PHASE 5) — an IntersectionObserver
  // watches every question panel; time accrues locally while a panel
  // is >50% visible and is flushed periodically, not per keystroke,
  // per PHASE 24's "avoid excessive DB writes."
  const timeAccrued = useRef<Record<string, number>>({});
  const visibleSince = useRef<Record<string, number>>({});

  const flushTimes = useCallback(() => {
    const now = Date.now();
    for (const qid of Object.keys(visibleSince.current)) {
      const since = visibleSince.current[qid]!;
      timeAccrued.current[qid] = (timeAccrued.current[qid] ?? 0) + (now - since) / 1000;
      visibleSince.current[qid] = now;
    }
    for (const [qid, seconds] of Object.entries(timeAccrued.current)) {
      if (seconds >= 1) {
        recordQuestionTime({ attemptId, questionId: qid, deltaSeconds: seconds });
        timeAccrued.current[qid] = 0;
      }
    }
  }, [attemptId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const qid = entry.target.getAttribute("data-question-id");
          if (!qid) continue;
          if (entry.isIntersecting) {
            visibleSince.current[qid] = Date.now();
          } else if (visibleSince.current[qid]) {
            timeAccrued.current[qid] =
              (timeAccrued.current[qid] ?? 0) + (Date.now() - visibleSince.current[qid]) / 1000;
            delete visibleSince.current[qid];
          }
        }
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll("[data-question-id]").forEach((el) => observer.observe(el));

    const flushInterval = setInterval(flushTimes, TIME_FLUSH_INTERVAL_MS);
    function onPageHide() {
      flushTimes();
      void flushPendingSaves(); // best-effort — not guaranteed to finish before unload, same as flushTimes
    }
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onPageHide);
    return () => {
      observer.disconnect();
      clearInterval(flushInterval);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onPageHide);
      flushTimes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Text-type inputs (FILL_IN_BLANK/NUMERICAL/SHORT_ANSWER/ESSAY) call
  // updateAnswer on every keystroke — debounced here so typing doesn't
  // fire a server action (and a DB write) per character. Choice-type
  // inputs (radio/checkbox) call updateAnswer directly without the
  // debounce flag — those are already discrete, low-frequency clicks.
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSaves = useRef<Record<string, { selectedOptionIds: string[]; textAnswer: string }>>({});
  const DEBOUNCE_MS = 500;

  function commitSave(questionId: string, merged: { selectedOptionIds: string[]; textAnswer: string }) {
    delete pendingSaves.current[questionId];
    const willBeAnswered = merged.selectedOptionIds.length > 0 || merged.textAnswer.trim().length > 0;
    return saveAnswer({
      attemptId,
      questionId,
      selectedOptionIds: merged.selectedOptionIds,
      textAnswer: merged.textAnswer,
    })
      .then(() => {
        if (lockAnswersAfterSelection && willBeAnswered) {
          setLocked((prevLocked) => new Set(prevLocked).add(questionId));
        }
      })
      .catch(() => {
        setLockToast("That answer is locked and can't be changed.");
      });
  }

  // Flushes any debounced text saves immediately and WAITS for them to
  // land — called before submitting so (a) a student who submits right
  // after typing never loses their last few characters to a pending
  // debounce timer, and (b) grading never reads QuestionAnswer before
  // that final save has actually been written.
  const flushPendingSaves = useCallback(() => {
    const pending: Promise<void>[] = [];
    for (const [questionId, timer] of Object.entries(debounceTimers.current)) {
      clearTimeout(timer);
      const merged = pendingSaves.current[questionId];
      if (merged) pending.push(commitSave(questionId, merged));
    }
    debounceTimers.current = {};
    return Promise.all(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateAnswer(
    questionId: string,
    next: { selectedOptionIds?: string[]; textAnswer?: string },
    opts?: { debounce?: boolean }
  ) {
    if (locked.has(questionId)) return; // belt-and-suspenders; UI already disables inputs
    setAnswers((prev) => {
      const merged = { ...(prev[questionId] ?? { selectedOptionIds: [], textAnswer: "" }), ...next };
      const updated = { ...prev, [questionId]: merged };

      if (opts?.debounce) {
        pendingSaves.current[questionId] = merged;
        clearTimeout(debounceTimers.current[questionId]);
        debounceTimers.current[questionId] = setTimeout(() => {
          delete debounceTimers.current[questionId];
          void commitSave(questionId, merged);
        }, DEBOUNCE_MS);
      } else {
        clearTimeout(debounceTimers.current[questionId]);
        delete debounceTimers.current[questionId];
        void commitSave(questionId, merged);
      }
      return updated;
    });
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function toggleMark(questionId: string) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    toggleMarkForReview(attemptId, questionId).catch(() => {
      // Non-critical UX aid — revert optimistic state on failure.
      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(questionId)) next.delete(questionId);
        else next.add(questionId);
        return next;
      });
    });
  }

  return (
    <div className={detectScreenshotAttempts ? "select-none" : undefined}>
      <ExamWatermark studentName={studentName} examTitle={examTitle} attemptId={attemptId} />

      {contentHidden && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <p className="text-sm font-semibold text-muted-foreground">
            Exam content hidden while page inactive.
          </p>
        </div>
      )}

      {/* Sticky status bar: timer stays visible without eating much
          space (a compact single row), and Submit here now opens the
          same confirm step as the bottom button rather than submitting
          immediately — a single mis-tap while scrolling on a phone
          must never instantly end the exam. */}
      <div className="glass-panel sticky top-16 z-10 mb-3 flex items-center justify-between gap-3 p-3 sm:top-20 sm:p-4">
        {remaining !== null ? (
          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground">
            <Clock className={`h-4 w-4 shrink-0 ${remaining < 60 ? "text-danger" : "text-accent"}`} />
            {formatTime(remaining)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Untimed</span>
        )}
        <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
          {answeredCount}/{questions.length} answered
        </span>
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={submitting}
          onClick={() => setConfirmingSubmit(true)}
          className="min-h-[40px]"
        >
          Submit
        </Button>
      </div>

      {/* Question navigator — a horizontally scrollable strip of numbered
          pills, each a real ~40px touch target and a same-page anchor
          link (no JS scroll math needed, works even if JS is slow to
          hydrate). Filled = answered, outlined = not yet — the same
          "N unanswered" signal shown compactly instead of needing a
          separate paginated question-by-question flow, which would be a
          much larger change to how this component works. Deliberately
          NOT sticky (unlike the status bar above it) — stacking two
          sticky elements needs exact pixel offsets that are easy to get
          subtly wrong without a live browser to verify against, and a
          wrong offset could hide the timer. Scrolling back up to jump
          elsewhere is an acceptable tradeoff for that certainty. */}
      <div className="glass-panel mb-4 overflow-x-auto p-2.5">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-[2px] border-border bg-accent" /> Answered
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-[2px] border-border bg-surface" /> Unanswered
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-[2px] border-xp bg-xp/40" /> Marked for review
          </span>
        </div>
        <div className="flex w-max gap-1.5">
          {questions.map((q, i) => {
            const a = answers[q.id];
            const isAnswered = (a?.selectedOptionIds.length ?? 0) > 0 || (a?.textAnswer.trim().length ?? 0) > 0;
            const isMarked = marked.has(q.id);
            return (
              <a
                key={q.id}
                href={`#question-${q.id}`}
                aria-label={`Jump to question ${i + 1}${isMarked ? " (marked for review)" : isAnswered ? " (answered)" : " (unanswered)"}`}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] font-mono text-xs font-bold transition-transform hover:-translate-y-0.5",
                  isMarked
                    ? "border-xp bg-xp/30 text-foreground"
                    : isAnswered
                      ? "border-border bg-accent text-accent-foreground"
                      : "border-border bg-surface text-muted-foreground"
                )}
              >
                {i + 1}
              </a>
            );
          })}
        </div>
      </div>

      {tabWarning && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle className="h-4 w-4" /> {tabWarning}
        </div>
      )}
      {lockToast && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <AlertTriangle className="h-4 w-4" /> {lockToast}
        </div>
      )}
      {sessionAnomaly && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
          <ShieldAlert className="h-4 w-4" /> Unusual session activity detected. Your attempt will be reviewed.
        </div>
      )}
      {offline && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="h-4 w-4" /> You're offline — your answers will sync once you're back online.
        </div>
      )}

      <StaggerContainer className="space-y-6">
        {questions.map((q, i) => {
          const current = answers[q.id] ?? { selectedOptionIds: [], textAnswer: "" };
          const isLocked = locked.has(q.id);
          return (
            <StaggerItem
              key={q.id}
              id={`question-${q.id}`}
              data-question-id={q.id}
              className={cn(
                "comic-panel scroll-mt-40 bg-surface p-5",
                detectScreenshotAttempts && "select-none"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="sticker-badge bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  Q{i + 1} · {q.points} pt{q.points === 1 ? "" : "s"}
                  {isLocked && " · 🔒 Locked"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleMark(q.id)}
                  aria-pressed={marked.has(q.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border-[2px] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    marked.has(q.id)
                      ? "border-xp bg-xp/20 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {marked.has(q.id) ? "★ Marked" : "☆ Mark for review"}
                </button>
              </div>
              <p className="mt-2 text-base font-semibold text-foreground">{q.prompt}</p>

              <div className="mt-4 space-y-2">
                {(q.type === "MCQ" || q.type === "TRUE_FALSE") &&
                  q.options.map((opt) => {
                    const checked = current.selectedOptionIds[0] === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          "comic-panel flex min-h-[48px] items-center gap-2.5 border-[3px] bg-surface p-3 text-base font-medium transition-transform",
                          isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-0.5",
                          checked ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground"
                        )}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={checked}
                          disabled={isLocked}
                          onChange={() => updateAnswer(q.id, { selectedOptionIds: [opt.id] })}
                        />
                        {opt.label}
                      </label>
                    );
                  })}

                {q.type === "MULTIPLE_SELECT" &&
                  q.options.map((opt) => {
                    const checked = current.selectedOptionIds.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          "comic-panel flex min-h-[48px] items-center gap-2.5 border-[3px] bg-surface p-3 text-base font-medium transition-transform",
                          isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-0.5",
                          checked ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLocked}
                          onChange={() =>
                            updateAnswer(q.id, {
                              selectedOptionIds: checked
                                ? current.selectedOptionIds.filter((id) => id !== opt.id)
                                : [...current.selectedOptionIds, opt.id],
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    );
                  })}

                {q.type === "FILL_IN_BLANK" && (
                  <input
                    value={current.textAnswer}
                    disabled={isLocked}
                    onChange={(e) => updateAnswer(q.id, { textAnswer: e.target.value }, { debounce: true })}
                    placeholder="Your answer"
                    // text-base (16px), not text-sm — an input under
                    // 16px triggers iOS Safari's automatic zoom-in on
                    // focus, which is jarring mid-exam and can make the
                    // Submit button scroll out of view unexpectedly.
                    className="h-11 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground disabled:opacity-60"
                  />
                )}

                {q.type === "NUMERICAL" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={current.textAnswer}
                      disabled={isLocked}
                      onChange={(e) => updateAnswer(q.id, { textAnswer: e.target.value }, { debounce: true })}
                      placeholder="Your answer"
                      className="h-11 w-full max-w-[12rem] rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground disabled:opacity-60"
                    />
                    {q.numericUnit && (
                      <span className="text-sm text-muted-foreground">{q.numericUnit}</span>
                    )}
                  </div>
                )}

                {(q.type === "SHORT_ANSWER" || q.type === "ESSAY") && (
                  <textarea
                    value={current.textAnswer}
                    disabled={isLocked}
                    onChange={(e) => updateAnswer(q.id, { textAnswer: e.target.value }, { debounce: true })}
                    rows={q.type === "ESSAY" ? 6 : 3}
                    placeholder="Your answer"
                    className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-base text-foreground disabled:opacity-60"
                  />
                )}
              </div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      {confirmingSubmit ? (
        <div className="comic-panel !bg-xp/10 mt-6 p-5 text-center">
          <p className="font-display text-base font-bold text-foreground">
            {unansweredCount > 0
              ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? "" : "s"}.`
              : "All questions answered."}
          </p>
          {marked.size > 0 && (
            <p className="mt-1 text-sm text-foreground">
              {marked.size} question{marked.size === 1 ? " is" : "s are"} still marked for review.
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Once submitted, you can't change your answers. Are you sure?
          </p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button
              type="button"
              size="lg"
              variant="accent"
              disabled={submitting}
              onClick={() => doSubmit()}
              className="min-h-[48px]"
            >
              {submitting ? "Submitting..." : "Yes, submit now"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmingSubmit(false)}
              className="min-h-[48px]"
            >
              Keep working
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          variant="accent"
          disabled={submitting}
          onClick={() => setConfirmingSubmit(true)}
          className="mt-6 min-h-[48px] w-full"
        >
          Submit encounter
        </Button>
      )}
    </div>
  );
}
