import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, Library, ChevronUp, ChevronDown, UploadCloud } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { QuestionForm } from "@/components/mentor-dashboard/question-form";
import { AssessmentPublishToggle } from "@/components/mentor-dashboard/assessment-publish-toggle";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { MentorExamAnalysis } from "@/components/mentor-dashboard/mentor-exam-analysis";
import { AddFromBankPicker } from "@/components/mentor-dashboard/add-from-bank-picker";
import { ImportQuestionsPanel } from "@/components/mentor-dashboard/question-import/import-questions-panel";
import { isGoogleDocsImportConfigured } from "@/lib/question-import/google-docs";
import { isAiGenerationConfigured } from "@/lib/ai/provider";
import {
  updateAssessment,
  duplicateAssessment,
  deleteQuestion,
  addExistingQuestionToAssessment,
  moveQuestionInAssessment,
} from "@/server/actions/assessment-actions";
import { getMentorAssessmentAnalytics } from "@/server/services/exam-analytics";
import { searchQuestionBank } from "@/server/services/question-bank";

/**
 * `<input type="datetime-local">` needs "YYYY-MM-DDTHH:mm" in the
 * viewer's *local* time — Date.toISOString() would silently shift the
 * displayed time to UTC, which is wrong to show a teacher setting a
 * monitoring window in their own timezone.
 */
function toLocalInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AssessmentEditorPage({
  params,
  searchParams,
}: {
  params: { missionId: string; assessmentId: string };
  searchParams: { docsError?: string; docsConnected?: string };
}) {
  const user = await requireRole("TEACHER");

  const assessment = await db.assessment.findUnique({
    where: { id: params.assessmentId },
    include: {
      questionLinks: {
        orderBy: { order: "asc" },
        include: { question: { include: { options: true } } },
      },
      course: { select: { id: true, title: true, teacherId: true } },
      chapter: { select: { id: true, title: true, module: { select: { title: true } } } },
      lesson: {
        select: {
          group: {
            select: {
              chapter: { select: { module: { select: { courseId: true, course: { select: { teacherId: true } } } } } },
            },
          },
        },
      },
    },
  });
  if (!assessment) notFound();
  const courseId = assessment.course?.id ?? assessment.lesson?.group.chapter.module.courseId;
  const ownerTeacherId =
    assessment.course?.teacherId ?? assessment.lesson?.group.chapter.module.course.teacherId;
  if (!courseId) notFound();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin && ownerTeacherId !== user.id) notFound();

  const chapterOptionsRaw = await db.module.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: { title: true, chapters: { orderBy: { order: "asc" }, select: { id: true, title: true } } },
  });
  const chapterOptions = chapterOptionsRaw.flatMap((m) =>
    m.chapters.map((c) => ({ id: c.id, title: `${m.title} — ${c.title}` }))
  );

  const boundUpdate = updateAssessment.bind(null, assessment.id);
  const boundDuplicate = duplicateAssessment.bind(null, assessment.id);
  const boundDeleteQuestion = (questionId: string) =>
    deleteQuestion.bind(null, assessment.id, questionId);

  // Bank questions from this course not already attached to this exam —
  // powers the "Add from bank" picker below.
  const bankCandidates = await searchQuestionBank(courseId, { excludeAssessmentId: assessment.id });
  const boundAddFromBank = async (questionId: string) => {
    "use server";
    await addExistingQuestionToAssessment(assessment.id, questionId);
  };

  // Only published assessments can have graded attempts worth analyzing.
  const analytics = assessment.publishedAt
    ? await getMentorAssessmentAnalytics(assessment.id)
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/mentor/missions/${params.missionId}/assessments`}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← All encounters
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {assessment.title}
          </h1>
          <Badge variant={assessment.publishedAt ? "accent" : "outline"}>
            {assessment.publishedAt ? "Published" : "Draft"}
          </Badge>
        </div>
        <AssessmentPublishToggle
          assessmentId={assessment.id}
          isPublished={Boolean(assessment.publishedAt)}
        />
      </div>

      {/* PHASE 10/14 — the exam dashboard's quick actions. Results and
          Integrity link out to dedicated pages (reusing
          exam-analytics.ts / the existing investigate-attempt page)
          rather than cramming everything into this one settings screen. */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
        <Link
          href={`/mentor/missions/${params.missionId}/assessments/${assessment.id}/results`}
          className="text-accent hover:text-accent/80"
        >
          View results →
        </Link>
        <Link href="/mentor/live-exams" className="text-accent hover:text-accent/80">
          Integrity dashboard →
        </Link>
        <form action={boundDuplicate}>
          <button type="submit" className="text-muted-foreground hover:text-foreground">
            Duplicate exam
          </button>
        </form>
      </div>

      <details className="glass-panel mt-6 p-5">
        <summary className="cursor-pointer list-none font-display text-sm font-bold text-foreground">
          Settings
        </summary>
        <form action={boundUpdate} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Title
            </label>
            <input
              name="title"
              defaultValue={assessment.title}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Chapter placement (optional)
            </label>
            <select
              name="chapterId"
              defaultValue={assessment.chapterId ?? ""}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            >
              <option value="">No chapter placement</option>
              {chapterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {assessment.chapter
                ? `Currently shown as "📝 Chapter Exam" under ${assessment.chapter.module.title} — ${assessment.chapter.title}.`
                : "Not placed at any chapter — students only see it on the mission's Exams tab."}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Instructions shown before starting
            </label>
            <textarea
              name="instructions"
              defaultValue={assessment.instructions ?? ""}
              rows={3}
              className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Type
              </label>
              <select
                name="kind"
                defaultValue={assessment.kind}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              >
                <option value="QUIZ">Quiz</option>
                <option value="EXAM">Exam</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Time limit (seconds, 0 = untimed)
              </label>
              <input
                type="number"
                name="timeLimitSeconds"
                defaultValue={assessment.timeLimitSeconds ?? 0}
                min={0}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Max attempts
              </label>
              <input
                type="number"
                name="maxAttempts"
                defaultValue={assessment.maxAttempts}
                min={1}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Pass percentage
              </label>
              <input
                type="number"
                name="passPercentage"
                defaultValue={assessment.passPercentage}
                min={0}
                max={100}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                🪙 Proggy Coin reward (0 = none)
              </label>
              <input
                type="number"
                name="coinReward"
                defaultValue={assessment.coinReward}
                min={0}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Min. score for coin reward (blank = same as pass %)
              </label>
              <input
                type="number"
                name="minimumScoreForCoinReward"
                defaultValue={assessment.minimumScoreForCoinReward ?? ""}
                min={0}
                max={100}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Question bank size (0 = use all questions)
              </label>
              <input
                type="number"
                name="questionBankSize"
                defaultValue={assessment.questionBankSize ?? 0}
                min={0}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Negative marking ratio (0–1)
              </label>
              <input
                type="number"
                step="0.05"
                name="negativeMarkingRatio"
                defaultValue={assessment.negativeMarkingRatio}
                min={0}
                max={1}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            {[
              ["randomizeQuestions", "Randomize question order", assessment.randomizeQuestions],
              ["fullscreenRequired", "Require fullscreen", assessment.fullscreenRequired],
              ["tabSwitchDetection", "Detect tab switching", assessment.tabSwitchDetection],
              ["showResultsInstantly", "Show results instantly", assessment.showResultsInstantly],
            ].map(([name, label, checked]) => (
              <label key={name as string} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name={name as string} defaultChecked={checked as boolean} />
                {label as string}
              </label>
            ))}
          </div>

          {/* Exam Integrity & Security — all additive, all off by
              default (see PHASE 20). Grouped separately from the basic
              settings above since these are the higher-stakes,
              "teacher chooses the level" security controls. */}
          <div className="rounded-lg border border-border/60 p-4">
            <p className="mb-3 text-sm font-semibold text-foreground">Exam integrity &amp; security</p>
            <div className="flex flex-wrap gap-5">
              {[
                ["lockAnswersAfterSelection", "Lock answers after selection", assessment.lockAnswersAfterSelection],
                ["detectCopyPaste", "Detect copy / paste", assessment.detectCopyPaste],
                ["detectScreenshotAttempts", "Detect screenshot attempts", assessment.detectScreenshotAttempts],
                ["detectSessionAnomalies", "Detect session anomalies", assessment.detectSessionAnomalies],
              ].map(([name, label, checked]) => (
                <label key={name as string} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" name={name as string} defaultChecked={checked as boolean} />
                  {label as string}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                If a student exits fullscreen (only applies when "Require fullscreen" is on)
              </label>
              <select
                name="fullscreenExitAction"
                defaultValue={assessment.fullscreenExitAction}
                className="h-10 w-full max-w-xs rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
              >
                <option value="WARNING">Warn and re-request fullscreen</option>
                <option value="FLAG">Flag for teacher review</option>
                <option value="AUTO_DISQUALIFY">Auto-disqualify</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" name="isLiveExam" defaultChecked={assessment.isLiveExam} />
              Live Exam mode
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Three separate windows: when this shows on your Live Exams dashboard (monitoring),
              when students can start a new attempt (access — can be wider), and how long one
              attempt lasts (Duration, above). Leave a field blank for "no restriction" on that side.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Monitoring starts
                </label>
                <input
                  type="datetime-local"
                  name="monitoringStartsAt"
                  defaultValue={toLocalInputValue(assessment.monitoringStartsAt)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Monitoring ends
                </label>
                <input
                  type="datetime-local"
                  name="monitoringEndsAt"
                  defaultValue={toLocalInputValue(assessment.monitoringEndsAt)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Student access opens
                </label>
                <input
                  type="datetime-local"
                  name="accessOpensAt"
                  defaultValue={toLocalInputValue(assessment.accessOpensAt)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Student access closes
                </label>
                <input
                  type="datetime-local"
                  name="accessClosesAt"
                  defaultValue={toLocalInputValue(assessment.accessClosesAt)}
                  className="h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Save settings
          </button>
        </form>
      </details>

      {analytics && (
        <div className="mt-8">
          <MentorExamAnalysis analytics={analytics} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Questions ({assessment.questionLinks.length})
        </h2>
        <div className="mt-4 space-y-3">
          {assessment.questionLinks.map((link, i) => {
            const q = link.question;
            return (
              <div key={q.id} className="glass-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Q{i + 1} · {q.type.replace("_", " ")} · {q.points} pt
                      {q.points === 1 ? "" : "s"}
                      {q.topic && <> · {q.topic}</>}
                      {" · "}
                      {q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase()}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{q.prompt}</p>
                    {q.type === "NUMERICAL" ? (
                      <p className="mt-2 text-xs font-medium text-accent">
                        Answer: {q.numericAnswer}
                        {q.numericTolerance ? ` ± ${q.numericTolerance}` : ""}
                        {q.numericUnit ? ` ${q.numericUnit}` : ""}
                      </p>
                    ) : (
                      q.options.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {q.options.map((o) => (
                            <li
                              key={o.id}
                              className={
                                o.isCorrect
                                  ? "text-xs font-medium text-accent"
                                  : "text-xs text-muted-foreground"
                              }
                            >
                              {o.isCorrect ? "✓ " : "· "}
                              {o.label}
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <div className="flex flex-col gap-1">
                      <form
                        action={async () => {
                          "use server";
                          await moveQuestionInAssessment(assessment.id, q.id, "up");
                        }}
                      >
                        <button
                          type="submit"
                          disabled={i === 0}
                          aria-label="Move up"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await moveQuestionInAssessment(assessment.id, q.id, "down");
                        }}
                      >
                        <button
                          type="submit"
                          disabled={i === assessment.questionLinks.length - 1}
                          aria-label="Move down"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                    <ConfirmDeleteButton
                      action={boundDeleteQuestion(q.id)}
                      confirmMessage="Remove this question from the encounter? (It stays in the question bank.)"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {assessment.questionLinks.length === 0 && (
            <p className="text-sm text-muted-foreground">No questions yet.</p>
          )}
        </div>

        {bankCandidates.length > 0 && (
          <div className="glass-panel mt-6 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
                <Library className="h-4 w-4" /> Add from question bank
              </h3>
              <Link
                href={`/mentor/missions/${courseId}/question-bank`}
                className="text-xs font-medium text-accent hover:text-accent/80"
              >
                Browse full bank →
              </Link>
            </div>
            <AddFromBankPicker
              questions={bankCandidates.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                points: q.points,
                usageCount: q._count.assessmentLinks,
              }))}
              action={boundAddFromBank}
            />
          </div>
        )}

        <div className="glass-panel mt-6 p-6">
          <h3 className="mb-4 font-display text-base font-semibold text-foreground">
            Add a new question
          </h3>
          <QuestionForm assessmentId={assessment.id} />
        </div>

        <div className="glass-panel mt-6 p-6">
          <h3 className="mb-4 flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
            <UploadCloud className="h-4 w-4" /> Import questions
          </h3>
          <ImportQuestionsPanel
            courseId={courseId}
            assessmentId={assessment.id}
            isGoogleDocsConfigured={isGoogleDocsImportConfigured()}
            googleDocsError={searchParams.docsError}
            googleDocsJustConnected={searchParams.docsConnected === "1"}
            isAiConfigured={isAiGenerationConfigured()}
            courseTitle={assessment.course?.title}
          />
        </div>
      </div>
    </div>
  );
}
