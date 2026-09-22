import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  Target,
  BookOpen,
  MessageCircle,
  Swords,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isLiveRoomEnabled } from "@/lib/live/flag";
import { resolveLiveClassState } from "@/lib/live/state";
import { ensureLiveClass } from "@/server/live/ensure-live-class";
import { db } from "@/lib/db/client";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { GroupSidebar } from "@/components/course/curriculum-sidebar";
import { MobileGroupSheet } from "@/components/course/mobile-group-sheet";
import { LessonPlayer } from "@/components/course/lesson-player";
import { LiveLessonSection } from "@/components/course/live-lesson-section";
import { BookmarkButton } from "@/components/course/bookmark-button";
import { NotesPanel } from "@/components/course/notes-panel";
import { DiscussionThread } from "@/components/course/discussion-thread";
import { GoogleResourceEmbed } from "@/components/course/google-resource-embed";
import { Badge } from "@/components/ui/badge";
import { flattenLessons, getAdjacentLessons } from "@/lib/course-tree";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { formatDhakaDate } from "@/lib/timezone";

export default async function LessonPlayerPage({
  params,
}: {
  params: {
    missionId: string;
    operationId: string;
    chapterId: string;
    groupId: string;
    patrolId: string;
  };
}) {
  const user = await getCurrentUser();

  // Only the minimal course row + the lesson itself are fetched up
  // front. The full module/chapter/group/lesson tree (needed for the
  // sidebar and prev/next navigation) is expensive and was previously
  // fetched unconditionally even when the request was about to be
  // redirected for lack of enrollment/purchase/preview access — it's
  // now deferred until after that gate passes.
  const [course, lesson] = await Promise.all([
    db.course.findUnique({
      where: { id: params.missionId },
      select: { id: true, slug: true },
    }),
    db.lesson.findUnique({
      where: { id: params.patrolId },
      include: {
        resources: true,
        assessments: { where: { publishedAt: { not: null } }, select: { id: true, title: true, kind: true } },
        assignments: { select: { id: true, title: true, dueAt: true } },
        liveClass: { select: { id: true, state: true, actualStart: true, actualEnd: true } },
        group: {
          select: {
            id: true,
            title: true,
            chapter: { select: { id: true, title: true, module: { select: { id: true, courseId: true, title: true } } } },
          },
        },
      },
    }),
  ]);
  if (!course) notFound();

  if (
    !lesson ||
    lesson.group.chapter.module.courseId !== course.id ||
    lesson.group.chapter.module.id !== params.operationId ||
    lesson.group.chapter.id !== params.chapterId ||
    lesson.group.id !== params.groupId
  ) {
    notFound();
  }

  // Uses params.missionId rather than course.id (identical value once
  // course is confirmed to exist) so this can run in the same batch as
  // the two queries above instead of waiting on them.
  const [enrollment, purchasedAsStoreItem] = await Promise.all([
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: params.missionId } },
    }),
    // A lesson can ALSO be unlocked individually as a Proggy Store
    // "Exclusive Class" (CoinStoreItem.lessonId), independent of course
    // enrollment — same bypass shape as the existing isPreview check
    // below, just sourced from a coin purchase instead.
    db.coinPurchase.findFirst({
      where: { userId: user.id, item: { lessonId: lesson.id } },
      select: { id: true },
    }),
  ]);
  if (!enrollment && !lesson.isPreview && !purchasedAsStoreItem) {
    redirect(`/courses/${course.slug}`);
  }

  // This URL is also the legacy "join live" destination (dashboard
  // card / live-classes listing used to always send students here).
  // If the live_room flag is on for this user, forward into the new
  // experience instead of silently rendering the old embed underneath
  // it — otherwise this route becomes a second, stale way to "join
  // live" that disagrees with /live/[liveClassId] (no chat, no
  // attendance, wrong state) for the exact same class.
  //
  // ensureLiveClass() (not just reading lesson.liveClass) matters here:
  // a LiveClass row is only ever created lazily, by the /live
  // dashboard's backfill or by the room page itself on open — nothing
  // creates it on the way in through THIS page. Without calling it, a
  // class nobody has opened /live for yet has no row, lesson.liveClass
  // is null, and this redirect silently never fires — exactly the
  // "still doesn't redirect me" symptom. Calling it here makes the
  // patrol page a valid entry point on its own, not just a follower of
  // whichever page happened to create the room first.
  //
  // Gated on a real ACTIVE/COMPLETED enrollment (not just isPreview or
  // a CoinStoreItem unlock): assertCanJoinLiveRoom — the access check
  // the room page itself runs — only recognizes course Enrollment,
  // with no preview or coin-purchase bypass yet. Redirecting someone
  // who only has one of those would trade working (if more limited)
  // access here for a hard "you need to be enrolled" wall over there.
  // Once the Live Room grows those bypasses, this condition can drop
  // to match.
  //
  // Deliberately skipped once the class has ENDED, too: LiveRoomVideo's
  // ENDED state is a dead-end "This class has ended." panel with no
  // video, whereas LiveLessonSection below hands off to the normal
  // resumable LessonPlayer for the recording. Redirecting an ended
  // class into the room would trade a working recording for a blank
  // screen, so the patrol page stays the canonical place to *rewatch*
  // a class even after it's fully migrated to the Live Room for
  // joining it live.
  if (
    lesson.scheduledStart &&
    enrollment &&
    (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") &&
    (await isLiveRoomEnabled(user))
  ) {
    const liveClass = lesson.liveClass ?? (await ensureLiveClass(lesson.id));
    const state = resolveLiveClassState(
      { scheduledStart: lesson.scheduledStart, scheduledEnd: lesson.scheduledEnd },
      liveClass,
      new Date()
    );
    if (state !== "ENDED") {
      redirect(`/live/${liveClass.id}`);
    }
  }
    enrollment &&
    (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") &&
    (await isLiveRoomEnabled(user))
  ) {
    const state = resolveLiveClassState(
      { scheduledStart: lesson.scheduledStart, scheduledEnd: lesson.scheduledEnd },
      lesson.liveClass,
      new Date()
    );
    if (state !== "ENDED") {
      redirect(`/live/${lesson.liveClass.id}`);
    }
  }

  // Fetched only now that we know the request isn't about to be
  // redirected. Only id/title are ever read from this tree
  // (flattenLessons + the sidebar's sibling lookup) — select instead of
  // include so we don't pull every lesson's description/video
  // id/duration/timestamps for the whole course on every video view.
  const courseTree = await db.course.findUnique({
    where: { id: course.id },
    select: {
      modules: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              groups: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  lessons: {
                    orderBy: { order: "asc" },
                    select: { id: true, title: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const flat = flattenLessons(courseTree?.modules ?? []);
  const { previous, next, index, total } = getAdjacentLessons(flat, lesson.id);

  const [notesRaw, discussionRaw, bookmark, allProgress] = await Promise.all([
    db.lessonNote.findMany({
      where: { userId: user.id, lessonId: lesson.id },
      orderBy: { createdAt: "desc" },
    }),
    db.discussionPost.findMany({
      where: { lessonId: lesson.id, isHidden: false },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.bookmark.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
    }),
    // Includes the current lesson's own progress row (it's part of
    // `flat`, the full course lesson list), so this single batched
    // query covers both "is the current lesson done, and where did I
    // leave off" and "which sibling lessons are complete" for the
    // sidebar — no need for a second findUnique on the same row.
    db.lessonProgress.findMany({
      where: { userId: user.id, lessonId: { in: flat.map((l) => l.lessonId) } },
      select: { lessonId: true, isCompleted: true, lastPositionSec: true },
    }),
  ]);
  const progress = allProgress.find((p) => p.lessonId === lesson.id) ?? null;

  const completedIds = new Set(
    allProgress.filter((p) => p.isCompleted).map((p) => p.lessonId)
  );

  // Sidebar is scoped to the CURRENT class type (LessonGroup) only — the
  // siblings a student would actually flip between — not the entire
  // course tree. See the comment on GroupSidebar for why.
  const currentModule = (courseTree?.modules ?? []).find((m) => m.id === lesson.group.chapter.module.id);
  const currentChapter = currentModule?.chapters.find((c) => c.id === lesson.group.chapter.id);
  const currentGroup = currentChapter?.groups.find((g) => g.id === lesson.group.id);
  const siblingLessons = (currentGroup?.lessons ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    isCompleted: completedIds.has(l.id),
  }));

  const isModerator = user.role === "TEACHER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const courseId = lesson.group.chapter.module.courseId;
  const moduleId = lesson.group.chapter.module.id;
  const chapterId = lesson.group.chapter.id;
  const groupId = lesson.group.id;
  const basePath = `/missions/${courseId}/operations/${moduleId}/chapters/${chapterId}/groups/${groupId}`;

  // Encounters (quizzes/exams) and challenges (assignments) collapse into a
  // single "Objectives" list — one checklist-style section rather than two
  // visually separate blocks — with a type badge distinguishing them.
  const objectives = [
    ...lesson.assessments.map((a) => ({
      id: a.id,
      href: `/encounters/${a.id}`,
      title: a.title,
      kind: a.kind === "EXAM" ? "Exam" : "Quiz",
      dueAt: null as Date | null,
    })),
    ...lesson.assignments.map((a) => ({
      id: a.id,
      href: `/challenges/${a.id}`,
      title: a.title,
      kind: "Challenge",
      dueAt: a.dueAt,
    })),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <StaggerContainer className="space-y-6">
        <StaggerItem>
          <CourseBreadcrumb
            steps={[
              { label: lesson.group.chapter.module.title, href: `/missions/${courseId}/operations/${moduleId}` },
              { label: lesson.group.chapter.title, href: `/missions/${courseId}/operations/${moduleId}/chapters/${chapterId}` },
              { label: lesson.group.title, href: basePath },
              { label: lesson.title },
            ]}
          />
        </StaggerItem>

        {/* Mission Control header */}
        <StaggerItem className="comic-panel bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-xl font-bold text-foreground">
              {lesson.title}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <span className="sticker px-3 py-1 font-mono text-xs font-bold text-foreground">
                Patrol {index + 1}/{total}
              </span>
              <BookmarkButton lessonId={lesson.id} initiallyBookmarked={Boolean(bookmark)} />
            </div>
          </div>
        </StaggerItem>

        {/* Mobile-only curriculum trigger — opens the same lesson list
            as a bottom sheet instead of consuming permanent width like
            the desktop sidebar does. */}
        <StaggerItem>
          <MobileGroupSheet
            basePath={basePath}
            groupTitle={lesson.group.title}
            lessons={siblingLessons}
            activeLessonId={lesson.id}
          />
        </StaggerItem>

        <StaggerItem>
        {lesson.scheduledStart ? (
          <LiveLessonSection
            lessonId={lesson.id}
            title={lesson.title}
            youtubeVideoId={lesson.youtubeVideoId ?? ""}
            scheduledStart={lesson.scheduledStart}
            scheduledEnd={lesson.scheduledEnd}
            serverNow={new Date()}
            resumeAtSeconds={progress?.lastPositionSec ?? 0}
            isCompleted={progress?.isCompleted ?? false}
          />
        ) : lesson.youtubeVideoId ? (
          <LessonPlayer
            lessonId={lesson.id}
            youtubeVideoId={lesson.youtubeVideoId}
            resumeAtSeconds={progress?.lastPositionSec ?? 0}
            isCompleted={progress?.isCompleted ?? false}
          />
        ) : (
          <div className="comic-panel flex aspect-video items-center justify-center bg-surface text-sm text-muted-foreground">
            No video set for this patrol yet.
          </div>
        )}
        </StaggerItem>

        {lesson.description && (
          <StaggerItem className="comic-panel bg-surface p-5">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {lesson.description}
            </p>
          </StaggerItem>
        )}

        {objectives.length > 0 && (
          <StaggerItem as="section">
            <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-foreground">
              <Target className="h-4 w-4 text-danger" /> Objectives
            </h2>
            <ul className="mt-3 space-y-2">
              {objectives.map((o) => (
                <li key={o.id}>
                  <Link
                    href={o.href}
                    className="hover-glow-card comic-panel flex items-center justify-between gap-3 bg-surface p-3.5"
                  >
                    <span className="flex items-center gap-3">
                      {o.kind === "Challenge" ? (
                        <Swords className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <Target className="h-4 w-4 shrink-0 text-accent" />
                      )}
                      <span className="text-sm font-medium text-foreground">{o.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {o.dueAt && (
                        <span className="text-xs text-muted-foreground">
                          due {formatDhakaDate(o.dueAt)}
                        </span>
                      )}
                      <Badge variant={o.kind === "Challenge" ? "xp" : "accent"}>{o.kind}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </StaggerItem>
        )}

        {lesson.resources.length > 0 && (
          <StaggerItem id="resources" as="section">
            <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-foreground">
              <BookOpen className="h-4 w-4 text-primary" /> Resources
            </h2>
            <div className="mt-3 space-y-3">
              {lesson.resources.map((r) =>
                r.type === "LINK" ? (
                  <GoogleResourceEmbed key={r.id} title={r.title} url={r.url} />
                ) : (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="comic-panel flex items-center gap-2 bg-surface p-3.5 text-sm font-medium text-foreground hover:text-primary"
                  >
                    <FileText className="h-4 w-4 text-accent" /> {r.title}
                    <Download className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                )
              )}
            </div>
          </StaggerItem>
        )}

        {/* Prev / next patrol */}
        <StaggerItem className="comic-panel flex items-center justify-between gap-2 bg-surface p-3">
          {previous ? (
            <Link
              href={`/missions/${course.id}/operations/${previous.moduleId}/chapters/${previous.chapterId}/groups/${previous.groupId}/patrols/${previous.lessonId}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface/60 hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              {/* Long titles must truncate, not overflow the row — two
                  long lesson names side by side in a justify-between
                  row would otherwise force horizontal scroll on narrow
                  phones. */}
              <span className="truncate">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/missions/${course.id}/operations/${next.moduleId}/chapters/${next.chapterId}/groups/${next.groupId}/patrols/${next.lessonId}`}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-end gap-1.5 rounded-full px-3 py-1.5 text-right text-sm font-semibold text-foreground hover:bg-surface/60 hover:text-primary"
            >
              <span className="truncate">{next.title}</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <span />
          )}
        </StaggerItem>

        <StaggerItem as="section">
          <h2 className="font-display text-lg font-bold text-foreground">
            Your notes
          </h2>
          <div className="mt-3">
            <NotesPanel
              lessonId={lesson.id}
              initialNotes={notesRaw.map((n) => ({
                id: n.id,
                content: n.content,
                timestampSec: n.timestampSec,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
          </div>
        </StaggerItem>

        <StaggerItem as="section">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-bold text-foreground">
            <MessageCircle className="h-4 w-4 text-accent" /> Discussion
          </h2>
          <div className="mt-3">
            <DiscussionThread
              lessonId={lesson.id}
              currentUserId={user.id}
              isModerator={isModerator}
              initialPosts={discussionRaw.map((p) => ({
                id: p.id,
                content: p.content,
                createdAt: p.createdAt.toISOString(),
                authorName: `${p.user.firstName} ${p.user.lastName}`.trim(),
                authorId: p.user.id,
                parentId: p.parentId,
              }))}
            />
          </div>
        </StaggerItem>
      </StaggerContainer>

      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <GroupSidebar
          basePath={basePath}
          groupTitle={lesson.group.title}
          lessons={siblingLessons}
          activeLessonId={lesson.id}
        />
      </div>
    </div>
  );
}
