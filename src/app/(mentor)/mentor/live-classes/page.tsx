import Link from "next/link";
import { Video, Calendar, Clock, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { courseAccessFilter } from "@/lib/auth/course-access";
import { db } from "@/lib/db/client";
import { getMentorLiveClasses, type MentorLiveClass } from "@/server/services/mentor-live-classes";
import { formatDhakaDate, formatDhakaTime, toDhakaInputValue } from "@/lib/timezone";
import {
  LiveClassControls,
  LiveClassCreateForm,
  type ChapterOption,
} from "@/components/mentor-dashboard/live-class-manager";

export default async function MentorLiveClassesPage() {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const { live, upcoming, ended } = await getMentorLiveClasses(user);
  const isEmpty = live.length === 0 && upcoming.length === 0 && ended.length === 0;

  // Missions this mentor can stream on, and (for ended classes) the chapters a
  // class can be added to. The hidden live container is never offered.
  const endedCourseIds = [...new Set(ended.filter((lc) => !lc.addedAsLesson).map((lc) => lc.course.id))];
  const [courses, modules] = await Promise.all([
    db.course.findMany({
      where: isAdmin ? {} : courseAccessFilter(user.id),
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    endedCourseIds.length
      ? db.module.findMany({
          where: { courseId: { in: endedCourseIds }, isLiveContainer: false },
          orderBy: { order: "asc" },
          select: {
            courseId: true,
            title: true,
            chapters: {
              orderBy: { order: "asc" },
              select: { title: true, groups: { orderBy: { order: "asc" }, select: { id: true, title: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const chapterOptionsByCourse = new Map<string, ChapterOption[]>();
  for (const m of modules) {
    const list = chapterOptionsByCourse.get(m.courseId) ?? [];
    for (const c of m.chapters) {
      for (const g of c.groups) list.push({ id: g.id, label: `${m.title} › ${c.title} › ${g.title}` });
    }
    chapterOptionsByCourse.set(m.courseId, list);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Video className="h-6 w-6 text-danger" /> Live Classes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule a live class here and choose which mission to stream it on. Live classes stay in the live
          room. Once one has ended, you can add it to a chapter as a normal lesson.
        </p>
      </div>

      <LiveClassCreateForm courses={courses} defaultOpen={isEmpty} />

      {isEmpty && (
        <div className="comic-panel bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">No live classes scheduled yet.</p>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Live Now
          </h2>
          <div className="space-y-3">
            {live.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} badge="LIVE" chapterOptions={[]} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} chapterOptions={[]} />
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent</h2>
          <div className="space-y-3">
            {ended.map((lc) => (
              <MentorLiveClassRow key={lc.id} lc={lc} chapterOptions={chapterOptionsByCourse.get(lc.course.id) ?? []} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MentorLiveClassRow({
  lc,
  badge,
  chapterOptions,
}: {
  lc: MentorLiveClass;
  badge?: string;
  chapterOptions: ChapterOption[];
}) {
  return (
    <div className="comic-panel bg-surface p-4">
      <Link href={lc.href} className="group flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-sm font-bold text-foreground">{lc.title}</p>
            {badge && (
              <span className="sticker flex shrink-0 items-center gap-1.5 bg-danger px-2 py-0.5 text-[10px] font-extrabold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {badge}
              </span>
            )}
            {!lc.youtubeVideoId && (
              <span className="sticker flex shrink-0 items-center gap-1 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                No stream link set
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{lc.course.title}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {formatDhakaDate(lc.scheduledStart)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDhakaTime(lc.scheduledStart)}
            </span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      </Link>

      <LiveClassControls
        lessonId={lc.id}
        title={lc.title}
        description={lc.description}
        youtubeUrl={lc.youtubeVideoId ? `https://youtu.be/${lc.youtubeVideoId}` : ""}
        startValue={toDhakaInputValue(lc.scheduledStart)}
        endValue={toDhakaInputValue(lc.scheduledEnd)}
        status={lc.status}
        addedAsLesson={lc.addedAsLesson}
        chapterOptions={chapterOptions}
      />
    </div>
  );
}
