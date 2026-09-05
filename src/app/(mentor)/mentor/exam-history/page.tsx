import Link from "next/link";
import { redirect } from "next/navigation";
import { History, Radio, Archive, PlusCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { getLiveExamStatus } from "@/lib/live-exam";
import { RISK_LEVEL_LABEL } from "@/lib/exam-integrity";
import { archiveAssessment, unarchiveAssessment, duplicateAssessment } from "@/server/actions/assessment-actions";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 25;

// Extends getLiveExamStatus's 5 states with DRAFT/PUBLISHED for
// ordinary (non-live-mode) exams — getLiveExamStatus alone treats
// every non-live exam as permanently "SCHEDULED" (it was designed only
// to answer "does this belong on the LIVE dashboard," a question that
// doesn't apply to ordinary exams at all), which is exactly why this
// hub needs its own status derivation rather than reusing that
// function's output directly for every row.
type ExamStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "LIVE" | "ACCESS_OPEN" | "CLOSED" | "ARCHIVED";

const STATUS_BADGE: Record<ExamStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-xp/15 text-xp-foreground",
  SCHEDULED: "bg-accent/15 text-accent",
  LIVE: "bg-danger/15 text-danger",
  ACCESS_OPEN: "bg-xp/15 text-xp-foreground",
  CLOSED: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
};

/**
 * "Exams" — the first-class, cross-mission Exam Management hub (Exam
 * Management spec PHASE 2/10). Built by extending the pre-existing
 * "Exam History" page rather than creating a second list: same
 * ownership scoping, same archive/unarchive actions, same
 * Assessment/AssessmentAttempt data — this just widens the query to
 * include drafts (previously only published exams were fetched here)
 * and adds average score, risk, chapter placement, and Duplicate.
 *
 * Live-mode exams currently LIVE or SCHEDULED are still deliberately
 * excluded — they belong on the dedicated Live Exams dashboard
 * (linked below) for active monitoring, not mixed into this
 * management list.
 */
export default async function ExamsHubPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const user = await requireRole("TEACHER");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const page = parsePageParam(searchParams.page);
  const where = isAdmin ? {} : { course: { teacherId: user.id } };

  const [assessments, total, courses] = await Promise.all([
    db.assessment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        course: { select: { id: true, title: true } },
        chapter: { select: { title: true, module: { select: { title: true } } } },
        lesson: { select: { title: true } },
        _count: { select: { attempts: true, questionLinks: true } },
      },
    }),
    db.assessment.count({ where }),
    db.course.findMany({
      where: isAdmin ? {} : { teacherId: user.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // One extra query for average score per assessment, grouped rather
  // than looped — avoids an N+1 across up to PAGE_SIZE rows.
  const avgScores = await db.assessmentAttempt.groupBy({
    by: ["assessmentId"],
    where: { assessmentId: { in: assessments.map((a) => a.id) }, status: "GRADED" },
    _avg: { percentage: true },
  });
  const avgScoreByAssessment = new Map(avgScores.map((s) => [s.assessmentId, s._avg.percentage]));

  // Count of attempts flagged HIGH_RISK/DISQUALIFIED per assessment, so the
  // hub can surface a risk badge without attaching riskLevel (an
  // attempt-level field) directly to the assessment row.
  const riskyAttempts = await db.assessmentAttempt.findMany({
    where: {
      assessmentId: { in: assessments.map((a) => a.id) },
      riskLevel: { in: ["HIGH_RISK", "DISQUALIFIED"] },
    },
    select: { assessmentId: true, riskLevel: true },
  });
  const riskByAssessment = new Map<string, "HIGH_RISK" | "DISQUALIFIED">();
  for (const r of riskyAttempts) {
    if (!riskByAssessment.has(r.assessmentId) || r.riskLevel === "DISQUALIFIED") {
      riskByAssessment.set(r.assessmentId, r.riskLevel as "HIGH_RISK" | "DISQUALIFIED");
    }
  }

  const now = new Date();
  const rows = assessments
    .map((a) => {
      let status: ExamStatus;
      if (a.archivedAt) status = "ARCHIVED";
      else if (!a.publishedAt) status = "DRAFT";
      else if (a.isLiveExam) status = getLiveExamStatus(a, now);
      else status = "PUBLISHED";
      return {
        ...a,
        status,
        avgScore: avgScoreByAssessment.get(a.id) ?? null,
        riskLevel: riskByAssessment.get(a.id) ?? null,
      };
    })
    .filter((a) => a.status !== "LIVE" && a.status !== "SCHEDULED");

  const boundArchive = async (assessmentId: string) => {
    "use server";
    await archiveAssessment(assessmentId);
  };
  const boundUnarchive = async (assessmentId: string) => {
    "use server";
    await unarchiveAssessment(assessmentId);
  };
  const boundDuplicate = async (assessmentId: string) => {
    "use server";
    await duplicateAssessment(assessmentId);
  };
  const goToMissionExams = async (formData: FormData) => {
    "use server";
    const courseId = String(formData.get("courseId") ?? "");
    if (!courseId) return;
    redirect(`/mentor/missions/${courseId}/assessments`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
          <History className="h-6 w-6 text-primary" /> Exams
        </h1>
        <Link
          href="/mentor/live-exams"
          className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80"
        >
          <Radio className="h-4 w-4" /> Live Exams
        </Link>
      </div>

      {/* PHASE 3 — "teacher should NOT need to create a Patrol first."
          This form is deliberately just a course picker, not a second
          creation wizard: the existing per-mission editor (missions/
          [id]/assessments) already IS the full create/configure flow
          (questions, settings, security, rewards, publish), so this
          only routes there instead of duplicating it. */}
      <form action={goToMissionExams} className="glass-panel mt-4 flex flex-wrap items-center gap-3 p-4">
        <PlusCircle className="h-5 w-5 shrink-0 text-primary" />
        <select
          name="courseId"
          required
          defaultValue=""
          className="h-10 flex-1 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        >
          <option value="" disabled>
            Choose a mission to create an exam in…
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="submit" className="comic-btn h-10 shrink-0 bg-primary px-4 text-xs font-bold text-primary-foreground">
          Create exam
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE[a.status]}`}>
                    {a.status.replace("_", " ")}
                  </span>
                  {a.riskLevel && (
                    <span className="text-[10px] font-semibold text-danger">
                      {RISK_LEVEL_LABEL[a.riskLevel]}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-display text-sm font-semibold text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {a.course?.title ?? "—"}
                  {a.chapter && ` · ${a.chapter.module.title} — ${a.chapter.title}`}
                  {a.lesson && ` · ${a.lesson.title}`}
                  {" · "}
                  {a._count.questionLinks} questions · {a._count.attempts} attempts
                  {a.avgScore != null && ` · avg ${Math.round(a.avgScore)}%`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                <Link
                  href={`/mentor/missions/${a.courseId ?? a.course?.id}/assessments/${a.id}`}
                  className="font-semibold text-primary hover:text-primary/80"
                >
                  Manage →
                </Link>
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <form action={boundDuplicate.bind(null, a.id)}>
                    <button type="submit" className="hover:text-foreground">Duplicate</button>
                  </form>
                  {a.status === "ARCHIVED" ? (
                    <form action={boundUnarchive.bind(null, a.id)}>
                      <button type="submit" className="hover:text-foreground">Unarchive</button>
                    </form>
                  ) : (
                    <form action={boundArchive.bind(null, a.id)}>
                      <button type="submit" className="flex items-center gap-1 hover:text-foreground">
                        <Archive className="h-3 w-3" /> Archive
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No exams yet — create one above.</p>
        )}
      </div>

      <PaginationControls page={page} totalPages={totalPages} basePath="/mentor/exam-history" />
    </div>
  );
}
