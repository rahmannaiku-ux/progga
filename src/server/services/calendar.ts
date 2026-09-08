import { db } from "@/lib/db/client";
import { dhakaDateKey } from "@/lib/timezone";

export type CalendarItem = {
  id: string;
  kind: "event" | "live_class" | "assignment_due";
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  href: string | null;
  courseTitle: string | null;
};

/**
 * Three sources, merged into one chronological list:
 *  - CalendarEvent: explicit entries a mentor/admin created (platform-
 *    wide via isGlobal, or scoped to one of the student's enrolled
 *    missions)
 *  - live classes: Lesson.scheduledStart, same source as
 *    server/services/live-classes.ts
 *  - assignment due dates: Assignment.dueAt, through the same
 *    lesson -> group -> chapter -> module -> course chain
 *
 * All three are scoped to the student's own enrollments (plus global
 * calendar events, which are intentionally visible to everyone) —
 * same enrollment-first pattern as every other student-facing query
 * in this app.
 */
export async function getStudentCalendarItems(userId: string): Promise<CalendarItem[]> {
  const enrollments = await db.enrollment.findMany({ where: { userId }, select: { courseId: true } });
  const courseIds = enrollments.map((e) => e.courseId);

  const [events, liveLessons, assignments] = await Promise.all([
    db.calendarEvent.findMany({
      where: { OR: [{ isGlobal: true }, { courseId: { in: courseIds } }] },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        courseId: true,
        course: { select: { title: true } },
      },
    }),
    courseIds.length === 0
      ? []
      : db.lesson.findMany({
          where: {
            scheduledStart: { not: null },
            isPublished: true,
            group: { chapter: { module: { courseId: { in: courseIds } } } },
          },
          select: {
            id: true,
            title: true,
            scheduledStart: true,
            scheduledEnd: true,
            group: {
              select: {
                id: true,
                chapter: {
                  select: {
                    id: true,
                    module: {
                      select: { id: true, courseId: true, course: { select: { title: true } } },
                    },
                  },
                },
              },
            },
          },
        }),
    courseIds.length === 0
      ? []
      : db.assignment.findMany({
          where: {
            dueAt: { not: null },
            lesson: { group: { chapter: { module: { courseId: { in: courseIds } } } } },
          },
          select: {
            id: true,
            title: true,
            dueAt: true,
            lesson: {
              select: {
                id: true,
                group: {
                  select: {
                    id: true,
                    chapter: {
                      select: {
                        id: true,
                        module: {
                          select: { id: true, courseId: true, course: { select: { title: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
  ]);

  const items: CalendarItem[] = [];

  for (const e of events) {
    items.push({
      id: e.id,
      kind: "event",
      title: e.title,
      description: e.description,
      startAt: e.startAt,
      endAt: e.endAt,
      href: e.courseId ? `/missions/${e.courseId}` : null,
      courseTitle: e.course?.title ?? null,
    });
  }

  for (const l of liveLessons) {
    if (!l.scheduledStart) continue;
    const courseId = l.group.chapter.module.courseId;
    items.push({
      id: l.id,
      kind: "live_class",
      title: l.title,
      description: null,
      startAt: l.scheduledStart,
      endAt: l.scheduledEnd,
      href: `/missions/${courseId}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`,
      courseTitle: l.group.chapter.module.course.title,
    });
  }

  for (const a of assignments) {
    if (!a.dueAt || !a.lesson) continue;
    const courseId = a.lesson.group.chapter.module.courseId;
    items.push({
      id: a.id,
      kind: "assignment_due",
      title: a.title,
      description: null,
      startAt: a.dueAt,
      endAt: null,
      href: `/challenges/${a.id}`,
      courseTitle: a.lesson.group.chapter.module.course.title,
    });
  }

  items.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return items;
}

/** One day's worth of gamification activity, keyed by Dhaka calendar
 * day elsewhere (see getStudentGamificationTimeline). `xp` is the
 * day's total from RewardEvent amounts; `entries` is the human-
 * readable breakdown (one row per RewardEvent and per positive
 * ProggyCoinTransaction) shown in the day-detail panel. */
export type DayGamificationSummary = {
  xp: number;
  entries: { label: string; xp: number; coins: number }[];
};

// Human-readable labels for RewardEvent.rewardType — keep in sync with
// XP_REWARDS in lib/gamification/xp-curve.ts. Falls back to the raw
// rewardType string for anything not listed here so a newly added
// reward type never disappears from the timeline, it just shows up
// unformatted until this map is updated.
const REWARD_TYPE_LABELS: Record<string, string> = {
  LESSON_COMPLETE: "Lesson completed",
  QUIZ_PASSED: "Quiz passed",
  EXAM_PASSED: "Exam passed",
  ASSIGNMENT_GRADED_PASS: "Assignment graded",
  MISSION_COMPLETE: "Mission completed",
  STREAK_MILESTONE: "Streak milestone",
};

/**
 * XP (RewardEvent) and Proggy Coin (ProggyCoinTransaction) activity
 * for a student, bucketed by the Dhaka calendar day each event fell
 * on, for calendar-overlay display (see (hero)/calendar/page.tsx).
 *
 * Only positive coin transactions are included — STORE_PURCHASE spends
 * are negative and aren't something a student "earned" on a given day,
 * so they'd be misleading next to a "+" badge. RewardEvent.amount is
 * always positive (awardXp never writes a negative amount), so no
 * equivalent filter is needed there.
 */
export async function getStudentGamificationTimeline(
  userId: string,
  start: Date,
  end: Date
): Promise<Map<string, DayGamificationSummary>> {
  const [rewardEvents, coinTransactions] = await Promise.all([
    db.rewardEvent.findMany({
      where: { userId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: "asc" },
    }),
    db.proggyCoinTransaction.findMany({
      where: { userId, amount: { gt: 0 }, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const map = new Map<string, DayGamificationSummary>();
  const getDay = (key: string): DayGamificationSummary => {
    let day = map.get(key);
    if (!day) {
      day = { xp: 0, entries: [] };
      map.set(key, day);
    }
    return day;
  };

  for (const event of rewardEvents) {
    const day = getDay(dhakaDateKey(event.createdAt));
    day.xp += event.amount;
    day.entries.push({
      label: REWARD_TYPE_LABELS[event.rewardType] ?? event.rewardType,
      xp: event.amount,
      coins: 0,
    });
  }

  for (const tx of coinTransactions) {
    const day = getDay(dhakaDateKey(tx.createdAt));
    day.entries.push({ label: tx.reason, xp: 0, coins: tx.amount });
  }

  return map;
}
