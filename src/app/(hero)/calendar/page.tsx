import Link from "next/link";
import { Calendar, Video, ClipboardList, CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getStudentCalendarItems, getStudentGamificationTimeline, type CalendarItem } from "@/server/services/calendar";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { formatDhakaTime, formatDhakaDate, dhakaDateKey, addDhakaMonths } from "@/lib/timezone";

const KIND_ICON = { event: Calendar, live_class: Video, assignment_due: ClipboardList } as const;
const KIND_LABEL = { event: "Event", live_class: "Live Class", assignment_due: "Due" } as const;

// Buckets by the Dhaka calendar day the event falls on, not the
// server's (UTC on Vercel) or browser's local day — see dhakaDateKey's
// comment. Without this, an event at, say, 1:00 AM Dhaka time (7:00 PM
// UTC the previous day) would silently show up under the wrong date
// header.
function groupByDate(items: CalendarItem[]) {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dhakaDateKey(item.startAt);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export default async function CalendarPage() {
  const user = await getCurrentUser();

  // Bounded window for the gamification overlay (3 months back, 2
  // forward from "now") — same reasoning as getStudentCalendarItems
  // scoping to enrollments: a long-tenured student's full RewardEvent/
  // ProggyCoinTransaction history isn't needed for a calendar that only
  // ever shows a few months at a time. The month grid itself can still
  // be navigated further via prev/next; days outside this window just
  // won't show XP/coin badges, which is an acceptable trade at this
  // scale (matches the "acceptable inline for the scale this platform
  // is built for at launch" precedent elsewhere in this codebase).
  const now = new Date();
  const gamificationRangeStart = addDhakaMonths(now, -3);
  const gamificationRangeEnd = addDhakaMonths(now, 2);

  const [allItems, heroStats, gamificationMap] = await Promise.all([
    getStudentCalendarItems(user.id),
    db.heroStats.findUnique({ where: { userId: user.id } }),
    getStudentGamificationTimeline(user.id, gamificationRangeStart, gamificationRangeEnd),
  ]);

  const startOfTodayDhaka = new Date(`${dhakaDateKey(now)}T00:00:00+06:00`);
  const upcoming = allItems.filter((i) => i.startAt >= startOfTodayDhaka);
  const grouped = groupByDate(upcoming);

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <CalendarDays className="h-6 w-6 text-accent" /> Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live classes, assignment due dates, and mission events for the missions you're enrolled
          in — plus your XP and streak history, right on the days you earned them.
        </p>
      </StaggerItem>

      <StaggerItem>
        <MonthCalendar
          items={allItems}
          gamification={Object.fromEntries(gamificationMap)}
          streak={{
            current: heroStats?.currentStreak ?? 0,
            longest: heroStats?.longestStreak ?? 0,
            lastActivityDate: heroStats?.lastActivityDate?.toISOString() ?? null,
          }}
        />
      </StaggerItem>

      {grouped.size > 0 && (
        <StaggerItem>
          <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-foreground">
            Upcoming
          </h2>
        </StaggerItem>
      )}

      {grouped.size === 0 && (
        <StaggerItem className="comic-panel bg-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing scheduled yet. Live classes and assignment due dates will show up here
            automatically.
          </p>
        </StaggerItem>
      )}

      {Array.from(grouped.entries()).map(([dateKey, items]) => (
        <StaggerItem key={dateKey}>
          <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {formatDhakaDate(`${dateKey}T00:00:00+06:00`, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const row = (
                <div className="comic-panel flex items-start gap-3 bg-surface p-3.5">
                  <span
                    className={
                      "sticker flex h-9 w-9 shrink-0 items-center justify-center " +
                      (item.kind === "live_class"
                        ? "bg-danger/15 text-danger"
                        : item.kind === "assignment_due"
                          ? "bg-accent/15 text-accent"
                          : "bg-primary/15 text-primary")
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                      <span className="sticker shrink-0 bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {KIND_LABEL[item.kind]}
                      </span>
                    </div>
                    {item.courseTitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.courseTitle}</p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {formatDhakaTime(item.startAt)}
                    </p>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              );
              return item.href ? (
                <Link key={item.id} href={item.href} prefetch={false} className="hover-glow-card block">
                  {row}
                </Link>
              ) : (
                <div key={item.id}>{row}</div>
              );
            })}
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
