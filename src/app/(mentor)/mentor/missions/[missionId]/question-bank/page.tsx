import Link from "next/link";
import { notFound } from "next/navigation";
import { Library, Tag } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { searchQuestionBank, getQuestionBankTopics } from "@/server/services/question-bank";
import { deleteBankQuestion } from "@/server/actions/assessment-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { ImportQuestionsPanel } from "@/components/mentor-dashboard/question-import/import-questions-panel";
import { isGoogleDocsImportConfigured } from "@/lib/question-import/google-docs";
import { isAiGenerationConfigured } from "@/lib/ai/provider";
import { TransformQuestionButton } from "@/components/mentor-dashboard/question-import/transform-question-button";
import { UploadCloud } from "lucide-react";

const TYPES = ["MCQ", "MULTIPLE_SELECT", "TRUE_FALSE", "FILL_IN_BLANK", "SHORT_ANSWER", "ESSAY", "NUMERICAL"];
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

/**
 * The reusable Question Bank for one course — every question created
 * anywhere (this course's assessment editors, and eventually AI/import
 * flows) lands here and can be reused across any exam in the course.
 * Deleting from here is real bank deletion (blocked while a question is
 * still attached to any exam) — different from the "remove from this
 * exam" action inside an assessment editor.
 */
export default async function QuestionBankPage({
  params,
  searchParams,
}: {
  params: { missionId: string };
  searchParams: {
    q?: string;
    type?: string;
    difficulty?: string;
    topic?: string;
    docsError?: string;
    docsConnected?: string;
  };
}) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: { id: true, title: true, teacherId: true },
  });
  if (!course) notFound();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin && course.teacherId !== user.id) notFound();

  const [questions, topics] = await Promise.all([
    searchQuestionBank(course.id, {
      q: searchParams.q,
      type: (searchParams.type as any) || undefined,
      difficulty: (searchParams.difficulty as any) || undefined,
      topic: searchParams.topic,
    }),
    getQuestionBankTopics(course.id),
  ]);

  const boundDelete = async (questionId: string) => {
    "use server";
    await deleteBankQuestion(questionId);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Library className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {course.title} — Question Bank
          </h1>
          <p className="text-sm text-muted-foreground">
            {questions.length} question{questions.length === 1 ? "" : "s"}. Reusable across every exam in this mission.
          </p>
        </div>
      </div>

      <form className="mt-5 flex flex-wrap gap-2" action={`/mentor/missions/${course.id}/question-bank`}>
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search prompt text..."
          className="h-9 flex-1 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
        />
        <select
          name="type"
          defaultValue={searchParams.type ?? ""}
          className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="difficulty"
          defaultValue={searchParams.difficulty ?? ""}
          className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {topics.length > 0 && (
          <select
            name="topic"
            defaultValue={searchParams.topic ?? ""}
            className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Filter
        </button>
        {(searchParams.q || searchParams.type || searchParams.difficulty || searchParams.topic) && (
          <Link
            href={`/mentor/missions/${course.id}/question-bank`}
            className="flex h-9 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="glass-panel mt-6 p-6">
        <h2 className="mb-4 flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
          <UploadCloud className="h-4 w-4" /> Import questions
        </h2>
        <ImportQuestionsPanel
          courseId={course.id}
          assessmentId={null}
          isGoogleDocsConfigured={isGoogleDocsImportConfigured()}
          googleDocsError={searchParams.docsError}
          googleDocsJustConnected={searchParams.docsConnected === "1"}
          isAiConfigured={isAiGenerationConfigured()}
          courseTitle={course.title}
        />
      </div>

      <div className="mt-5 space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{q.type.replace("_", " ")}</span>
                  <span>·</span>
                  <span>{q.points} pt{q.points === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase()}</span>
                  {q.topic && (
                    <>
                      <span>·</span>
                      <span>{q.topic}</span>
                    </>
                  )}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    used in {q._count.assessmentLinks} exam{q._count.assessmentLinks === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="mt-1.5 text-sm text-foreground">{q.prompt}</p>
                {q.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {q.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <Tag className="h-2.5 w-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
                {isAiGenerationConfigured() && (
                  <TransformQuestionButton questionId={q.id} courseId={course.id} />
                )}
              </div>
              <ConfirmDeleteButton
                action={boundDelete.bind(null, q.id)}
                confirmMessage={
                  q._count.assessmentLinks > 0
                    ? "This question is still used in one or more exams — remove it from those exams first."
                    : "Delete this question from the bank permanently?"
                }
              />
            </div>
          </div>
        ))}
        {questions.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No questions match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
