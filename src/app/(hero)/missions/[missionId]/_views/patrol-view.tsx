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
import { navPath, type MissionNav } from "@/server/services/mission-paths";
import { CourseBreadcrumb } from "@/components/course/course-breadcrumb";
import { GroupLessonStrip } from "@/components/course/group-lesson-strip";
import { mediaSrc } from "@/lib/media-url";
import { lessonShare } from "@/lib/progress-math";
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
import { maskPhone } from "@/lib/account-deletion";

export async function PatrolView(
  props: {
    params: Promise<{
      missionId: string;
      operationId: string;
      chapterId: string;
      groupId: string;
      patrolId: string;
    }>;
    nav: MissionNav;
  }
) {
  const params = await props.params;
  const nav = props.nav;
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
      select: { id: true, slug: true, teacher: { select: { firstName: true, lastName: true } } },
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

  // Fetched only now that we know the request isn't about to be
  // redirected. Only id/title are ever read from this tree
  // (flattenLessons + the sidebar's sibling lookup) — select instead of
  // include so we don't pull every lesson's description/video
  // id/duration/timestamps for the whole course on every video view.
  const courseTree = await db.course.findUnique({
    where: { id: course.id },
    select: {
      modules: {
        where: { isLiveContainer: false },
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
                    select: { id: true, title: true, durationSeconds: true, youtubeVideoId: true, thumbnailUrl: true, scheduledStart: true },
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
      select: { lessonId: true, isCompleted: true, lastPositionSec: true, watchedSeconds: true, durationSec: true },
    }),
  ]);
  const progress = allProgress.find((p) => p.lessonId === lesson.id) ?? null;

  const completedIds = new Set(
    allProgress.filter((p) => p.isCompleted).map((p) => p.lessonId)
  );
  // How much of each lesson is done (0..1), counting partly watched ones.
  const progressById = new Map(allProgress.map((p) => [p.lessonId, p]));
  const shareOf = (l: { id: string; durationSeconds: number }) => lessonShare(progressById.get(l.id), l.durationSeconds);

  // Sidebar is scoped to the CURRENT class type (LessonGroup) only — the
  // siblings a student would actually flip between — not the entire
  // course tree, the siblings a student flips between.
  const currentModule = (courseTree?.modules ?? []).find((m) => m.id === lesson.group.chapter.module.id);
  const currentChapter = currentModule?.chapters.find((c) => c.id === lesson.group.chapter.id);
  const currentGroup = currentChapter?.groups.find((g) => g.id === lesson.group.id);
  // The phone row under the player: only this class's own recorded patrols (same rule as the class page —
  // a live class never sits among them), with the thumbnails the class page shows.
  const stripLessons = (currentGroup?.lessons ?? [])
    .filter((l) => !l.scheduledStart || l.id === lesson.id)
    .map((l) => {
      const uploaded = mediaSrc(l.thumbnailUrl);
      return {
        id: l.id,
        href: navPath(nav, l.id),
        title: l.title,
        isCompleted: completedIds.has(l.id),
        share: shareOf(l),
        thumb: uploaded ?? (l.youtubeVideoId ? `https://i.ytimg.com/vi/${l.youtubeVideoId}/hqdefault.jpg` : null),
        uploadedThumb: Boolean(uploaded),
      };
    });
  const mentorName = `${course.teacher.firstName} ${course.teacher.lastName}`.trim() || "Mentor";

  const isModerator = user.role === "TEACHER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  // Traces a screen recording back to the account it came from.
  const viewerTag = [`${user.firstName} ${user.lastName}`.trim(), maskPhone(user.phone)].filter(Boolean).join(" · ");

  const courseId = lesson.group.chapter.module.courseId;
  const moduleId = lesson.group.chapter.module.id;
  const chapterId = lesson.group.chapter.id;
  const groupId = lesson.group.id;

  // Encounters (quizzes/exams) and challenges (assignments) collapse into a
  // single "Objectives" list — one checklist-style section rather than two
  // visually separate blocks — with a type badge distinguishing them.
  const objectives = [
    ...lesson.assessments.map((a) => ({
      id: a.id,
      href: `/exams/${a.id}`,
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
    // minmax(0, …) columns: a column must never grow to fit a wide child (the swipeable patrol row is wider
    // than the screen by design and scrolls inside itself), or the whole page gets wider than the phone.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <StaggerContainer className="min-w-0 space-y-6">
        <StaggerItem>
          <CourseBreadcrumb
            steps={[
              { label: lesson.group.chapter.module.title, href: navPath(nav, moduleId) },
              { label: lesson.group.chapter.title, href: navPath(nav, chapterId) },
              { label: lesson.group.title, href: navPath(nav, groupId) },
              { label: lesson.title },
            ]}
          />
        </StaggerItem>

        {/* Mission Control header */}
        <StaggerItem className="comic-panel bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 break-words font-display text-xl font-bold text-foreground">
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
            watermark={viewerTag}
          />
        ) : lesson.youtubeVideoId ? (
          <LessonPlayer
            lessonId={lesson.id}
            youtubeVideoId={lesson.youtubeVideoId}
            resumeAtSeconds={progress?.lastPositionSec ?? 0}
            isCompleted={progress?.isCompleted ?? false}
            initialWatchedSeconds={progress?.watchedSeconds ?? 0}
            watermark={viewerTag}
            lessonDurationSec={lesson.durationSeconds}
          />
        ) : (
          <div className="comic-panel flex aspect-video items-center justify-center bg-surface text-sm text-muted-foreground">
            No video set for this patrol yet.
          </div>
        )}
        </StaggerItem>

        {/* Phone and tablet: the other patrols of this class as a row to swipe
            through. Wide screens show the same cards as a column beside the player. */}
        <StaggerItem className="lg:hidden">
          <GroupLessonStrip
            layout="row"
            groupTitle={lesson.group.title}
            mentorName={mentorName}
            lessons={stripLessons}
            activeLessonId={lesson.id}
          />
        </StaggerItem>

        {lesson.description && (
          <StaggerItem className="comic-panel bg-surface p-5">
            <p className="whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground sm:text-sm">
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
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      {o.kind === "Challenge" ? (
                        <Swords className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <Target className="h-4 w-4 shrink-0 text-accent" />
                      )}
                      <span className="min-w-0 break-words text-sm font-medium text-foreground">{o.title}</span>
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
                  <GoogleResourceEmbed
                    key={r.id}
                    title={r.title}
                    url={r.url}
                    downloadHref={r.downloadable ? `/api/resources/${r.id}/download` : undefined}
                  />
                ) : (
                  <div key={r.id} className="comic-panel flex min-h-11 flex-wrap items-center gap-2 bg-surface p-2.5 pl-3.5">
                    <a
                      // Opens through the server, so the storage address never
                      // reaches the page and the lesson's access rule applies.
                      href={`/api/resources/${r.id}/download?view=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-accent" />
                      <span className="min-w-0 break-words">{r.title}</span>
                    </a>
                    {r.downloadable && (
                      // A plain link to an attachment response: the browser saves
                      // the file straight away, with no new tab or viewer.
                      <a
                        href={`/api/resources/${r.id}/download`}
                        download
                        className="comic-btn inline-flex min-h-11 shrink-0 items-center gap-1.5 bg-primary px-4 text-sm font-semibold text-primary-foreground"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" /> Download
                      </a>
                    )}
                  </div>
                )
              )}
            </div>
          </StaggerItem>
        )}

        {/* Prev / next patrol: one labelled card each, side by side when
            both exist, full width when there is only one (no empty half). */}
        {(previous || next) && (
          <StaggerItem className={previous && next ? "grid grid-cols-2 gap-3" : "grid grid-cols-1"}>
            {previous && (
              <Link
                href={navPath(nav, previous.lessonId)}
                className="comic-panel flex min-h-14 min-w-0 items-center gap-2 bg-surface px-3 py-2.5 text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
                {/* Long titles truncate instead of widening the page on narrow phones. */}
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Previous</span>
                  <span className="block truncate text-sm font-semibold">{previous.title}</span>
                </span>
              </Link>
            )}
            {next && (
              <Link
                href={navPath(nav, next.lessonId)}
                className="comic-panel flex min-h-14 min-w-0 items-center justify-end gap-2 bg-surface px-3 py-2.5 text-right text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Next patrol</span>
                  <span className="block truncate text-sm font-semibold">{next.title}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
              </Link>
            )}
          </StaggerItem>
        )}

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

      <div className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
        <GroupLessonStrip
          layout="column"
          groupTitle={lesson.group.title}
          mentorName={mentorName}
          lessons={stripLessons}
          activeLessonId={lesson.id}
        />
      </div>
    </div>
  );
}
