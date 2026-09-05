import { CheckCircle2, Circle, Flame } from "lucide-react";
import { db } from "@/lib/db/client";
import { cn } from "@/lib/utils";

const WEEKLY_GOAL_LESSONS = 5;

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export async function DailyGoalsWidget({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(today);

  const [completedToday, completedThisWeek, stats] = await Promise.all([
    db.lessonProgress.count({
      where: { userId, isCompleted: true, completedAt: { gte: today } },
    }),
    db.lessonProgress.count({
      where: { userId, isCompleted: true, completedAt: { gte: weekStart } },
    }),
    db.heroStats.findUnique({ where: { userId } }),
  ]);

  const dailyDone = completedToday >= 1;
  const weeklyDone = completedThisWeek >= WEEKLY_GOAL_LESSONS;
  const streakLoggedToday = (() => {
    if (!stats?.lastActivityDate) return false;
    const last = new Date(stats.lastActivityDate);
    last.setHours(0, 0, 0, 0);
    return last.getTime() === today.getTime();
  })();

  return (
    <div className={className ?? "glass-panel p-5"}>
      <h3 className="font-display text-sm font-bold text-foreground">
        Today's goals
      </h3>
      <ul className="mt-3 space-y-2.5">
        <li className="flex items-center gap-2 text-sm">
          {dailyDone ? (
            <CheckCircle2 className="h-4 w-4 text-accent" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn(dailyDone ? "text-foreground" : "text-muted-foreground")}>
            Complete 1 patrol today
          </span>
        </li>
        <li className="flex items-center gap-2 text-sm">
          {weeklyDone ? (
            <CheckCircle2 className="h-4 w-4 text-accent" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn(weeklyDone ? "text-foreground" : "text-muted-foreground")}>
            Complete {WEEKLY_GOAL_LESSONS} patrols this week ({completedThisWeek}/
            {WEEKLY_GOAL_LESSONS})
          </span>
        </li>
        <li className="flex items-center gap-2 text-sm">
          {streakLoggedToday ? (
            <CheckCircle2 className="h-4 w-4 text-accent" />
          ) : (
            <Flame className={cn("h-4 w-4", (stats?.currentStreak ?? 0) > 0 ? "text-danger" : "text-muted-foreground")} />
          )}
          <span className={cn(streakLoggedToday ? "text-foreground" : "text-muted-foreground")}>
            {stats?.currentStreak
              ? `Keep your ${stats.currentStreak}-day streak alive`
              : "Start a streak today"}
          </span>
        </li>
      </ul>
    </div>
  );
}
