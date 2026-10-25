"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Flame, Video, ClipboardList, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  addDhakaDays,
  addDhakaMonths,
  dhakaDateKey,
  dhakaStartOfDay,
  dhakaStartOfMonth,
  dhakaStartOfWeek,
  formatDhakaDate,
  formatDhakaTime,
} from "@/lib/timezone";
import type { CalendarItem } from "@/server/services/calendar";
import type { DayGamificationSummary } from "@/server/services/calendar";

// Three kinds, three clearly different hues (blue, red, amber), each with its own icon in the
// day list so colour is never the only cue. Streak days use the streak flame's red-orange.
const KIND_DOT = {
  event: "bg-primary",
  live_class: "bg-danger",
  assignment_due: "bg-xp",
} as const;

const KIND_CHIP = {
  event: "bg-primary/12 text-primary dark:bg-primary/25 dark:text-foreground",
  live_class: "bg-danger/12 text-danger dark:bg-danger/25 dark:text-foreground",
  assignment_due: "bg-xp/25 text-xp-ink dark:bg-xp/20 dark:text-xp",
} as const;

const KIND_ICON = { event: CalendarIcon, live_class: Video, assignment_due: ClipboardList } as const;
const KIND_LABEL = { event: "Mission event", live_class: "Live class", assignment_due: "Challenge due" } as const;

type ViewMode = "month" | "week";

export function MonthCalendar({
  items,
  gamification,
  streak,
  serverNow,
}: {
  items: CalendarItem[];
  gamification: Record<string, DayGamificationSummary>;
  streak: { current: number; longest: number; lastActivityDate: string | null };
  // The server's clock when the page was rendered. "Today" comes from
  // here, never from the device, so a phone whose date was changed by
  // hand can't light up streak days or move the today mark.
  serverNow: string;
}) {
  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => now);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = dhakaDateKey(item.startAt);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  // The actual window of days the current streak covers — real data
  // from HeroStats (currentStreak + lastActivityDate), not decoration.
  // If lastActivityDate is today or yesterday the streak is still
  // "live"; if it's further back the streak has already lapsed, so
  // nothing lights up (matches updateStreak()'s own reset-to-1 logic
  // in award-xp.ts — a lapsed streak isn't still "active" for display
  // purposes even though currentStreak hasn't been reset to 0 yet).
  const streakDayKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!streak.lastActivityDate || streak.current <= 0) return keys;
    const last = new Date(streak.lastActivityDate);
    // Whole Bangladesh calendar days between today and the last active day.
    const dayDiff = Math.round(
      (dhakaStartOfDay(now).getTime() - dhakaStartOfDay(last).getTime()) / 86_400_000
    );
    if (dayDiff > 1) return keys;
    for (let i = 0; i < streak.current; i++) {
      keys.add(dhakaDateKey(addDhakaDays(last, -i)));
    }
    return keys;
  }, [streak, now]);

  // Every day here is an instant at 00:00 *Dhaka* time, and every
  // "which day / which month / is it today" question is answered from
  // the Dhaka date key — never from the browser's local zone.
  const days = useMemo(() => {
    const first = view === "month" ? dhakaStartOfWeek(dhakaStartOfMonth(cursor)) : dhakaStartOfWeek(cursor);
    const lastDayOfRange =
      view === "month"
        ? addDhakaDays(dhakaStartOfMonth(addDhakaMonths(cursor, 1)), -1)
        : addDhakaDays(first, 6);
    const last = addDhakaDays(dhakaStartOfWeek(lastDayOfRange), 6);
    const out: Date[] = [];
    for (let d = first; d.getTime() <= last.getTime(); d = addDhakaDays(d, 1)) out.push(d);
    return out;
  }, [cursor, view]);

  const todayKey = dhakaDateKey(now);
  const cursorMonthKey = dhakaDateKey(cursor).slice(0, 7);

  const headerLabel =
    view === "month"
      ? formatDhakaDate(cursor, { month: "long", year: "numeric" })
      : `${formatDhakaDate(days[0]!, { month: "short", day: "numeric" })} – ${formatDhakaDate(days[days.length - 1]!, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;

  const goPrev = () => setCursor((c) => (view === "month" ? addDhakaMonths(c, -1) : addDhakaDays(c, -7)));
  const goNext = () => setCursor((c) => (view === "month" ? addDhakaMonths(c, 1) : addDhakaDays(c, 7)));

  const selectedDay = selectedKey ? new Date(selectedKey) : null;
  const selectedItems = selectedKey ? (itemsByDay.get(selectedKey) ?? []) : [];
  const selectedGamification = selectedKey ? gamification[selectedKey] : undefined;

  return (
    <div className="comic-panel bg-surface p-4">
      {/* Top bar: month/week toggle + prev/next, matching the reference layout */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-foreground">{headerLabel}</h2>
          {streak.current > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-danger">
              <Flame className="h-3.5 w-3.5 fill-danger" /> {streak.current}-day streak
              {streak.current === streak.longest && streak.longest > 1 ? " — your best yet!" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="sticker flex overflow-hidden rounded-lg border border-border/60">
            <button
              onClick={() => setView("month")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold",
                view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Month
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold",
                view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Week
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={goPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={cn("grid grid-cols-7 gap-1", view === "month" ? "auto-rows-[minmax(72px,auto)]" : "auto-rows-[minmax(120px,auto)]")}>
        {days.map((day) => {
          const key = dhakaDateKey(day);
          const dayItems = itemsByDay.get(key) ?? [];
          const visibleItems = dayItems.slice(0, view === "month" ? 2 : 4);
          const overflow = dayItems.length - visibleItems.length;
          const dayGamification = gamification[key];
          const inStreak = streakDayKeys.has(key);
          const outsideMonth = view === "month" && key.slice(0, 7) !== cursorMonthKey;
          const selected = selectedKey === key;
          const isTodayCell = key === todayKey;
          // Friday and Saturday: the weekend in Bangladesh.
          const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
          const isWeekend = weekday === 5 || weekday === 6;

          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={cn(
                "relative flex flex-col items-stretch gap-0.5 rounded-xl border p-1 text-left transition-colors",
                outsideMonth
                  ? "border-transparent opacity-35"
                  : cn("border-border/10 hover:border-primary/40", isWeekend ? "bg-muted/70 dark:bg-muted/10" : "bg-background/60"),
                inStreak && !outsideMonth && "bg-danger/[0.06] dark:bg-danger/10",
                isTodayCell && "border-primary/60",
                selected && "ring-2 ring-primary/60"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold",
                    isTodayCell ? "bg-primary text-primary-foreground" : isWeekend ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {Number(key.slice(8, 10))}
                </span>
                <div className="flex items-center gap-0.5">
                  {inStreak && !outsideMonth && <Flame className="h-3 w-3 fill-danger/70 text-danger" aria-label="Streak day" />}
                  {dayGamification && dayGamification.xp > 0 && (
                    <span className="hidden text-[9px] font-bold text-xp-ink dark:text-xp sm:inline">+{dayGamification.xp}</span>
                  )}
                </div>
              </div>

              {/* Phones: a dot per item (titles don't fit); tap the day for the list. */}
              {dayItems.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                  {dayItems.slice(0, 4).map((item) => (
                    <span key={item.id} className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[item.kind])} />
                  ))}
                </div>
              )}
              <div className="hidden flex-col gap-0.5 sm:flex">
                {visibleItems.map((item) => (
                  <span
                    key={item.id}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[9px] font-semibold leading-tight",
                      KIND_CHIP[item.kind]
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] font-bold text-muted-foreground">+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-3 text-[11px] font-semibold text-muted-foreground">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", KIND_DOT[kind])} />
            {KIND_LABEL[kind]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <Flame className="h-3 w-3 fill-danger/70 text-danger" /> Streak day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold text-xp-ink dark:text-xp">+XP</span> XP earned
        </span>
      </div>

      {/* Selected day detail — scheduled items + what was actually earned */}
      {selectedDay && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <h3 className="mb-2 font-display text-xs font-bold text-foreground">
            {formatDhakaDate(`${selectedKey}T00:00:00+06:00`, { weekday: "long", month: "long", day: "numeric" })}
          </h3>

          {selectedItems.length === 0 && !selectedGamification && (
            <p className="text-xs text-muted-foreground">Nothing scheduled or earned this day.</p>
          )}

          <div className="space-y-1.5">
            {selectedItems.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-xs font-semibold text-foreground">{item.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDhakaTime(item.startAt)}
                  </span>
                </div>
              );
            })}
          </div>

          {selectedGamification && selectedGamification.entries.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {selectedGamification.entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-xp/10 px-2.5 py-1.5">
                  <Flame className="h-3.5 w-3.5 shrink-0 text-danger" />
                  <span className="flex-1 truncate text-xs font-semibold text-foreground">{entry.label}</span>
                  {entry.xp > 0 && (
                    <Badge variant="xp" className="shrink-0">
                      +{entry.xp} XP
                    </Badge>
                  )}
                  {entry.coins > 0 && (
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground"><Coins className="mr-0.5 inline h-3 w-3" aria-hidden="true" />+{entry.coins}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
