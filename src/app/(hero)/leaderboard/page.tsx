import Link from "next/link";
import { Trophy, Flame, Medal } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { Avatar } from "@/components/shared/avatar";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";

const TOP_N = 50;

const TABS = [
  { key: "global", label: "Global", enabled: true },
  { key: "all-time", label: "All-Time", enabled: true },
  { key: "week", label: "This Week", enabled: false },
  { key: "friends", label: "Friends", enabled: false },
] as const;

const PODIUM_THEME = [
  { medal: "text-xp", ring: "bg-xp/15", label: "1st", scale: "sm:scale-110 sm:-translate-y-2" },
  { medal: "text-muted-foreground", ring: "bg-surface", label: "2nd", scale: "" },
  { medal: "text-orange-400", ring: "bg-orange-400/15", label: "3rd", scale: "" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  const activeTab = TABS.some((t) => t.key === searchParams.tab && t.enabled) ? searchParams.tab : "global";

  const top = await db.heroStats.findMany({
    orderBy: { xp: "desc" },
    take: TOP_N,
    include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });

  const myRankIndex = top.findIndex((s) => s.userId === user.id);
  let myRankRow: (typeof top)[number] | null = null;
  let myRank: number | null = null;

  if (myRankIndex === -1) {
    const myStats = await db.heroStats.findUnique({
      where: { userId: user.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (myStats) {
      const higherCount = await db.heroStats.count({ where: { xp: { gt: myStats.xp } } });
      myRankRow = myStats;
      myRank = higherCount + 1;
    }
  }

  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Trophy className="h-7 w-7 fill-xp text-xp" />
        <h1 className="font-display text-3xl font-extrabold text-foreground">
          Top learners
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Top heroes by total XP across the platform.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) =>
          t.enabled ? (
            <Link
              key={t.key}
              href={t.key === "global" ? "/leaderboard" : `/leaderboard?tab=${t.key}`}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                activeTab === t.key
                  ? "bg-xp text-xp-foreground shadow-card"
                  : "bg-surface text-muted-foreground shadow-card hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.key}
              title="Coming soon"
              className="cursor-not-allowed rounded-full bg-surface px-4 py-2 text-sm font-bold text-muted-foreground/50 shadow-card"
            >
              {t.label}
            </span>
          )
        )}
      </div>

      {podium.length === 3 && (
        <StaggerContainer className="mt-8 grid grid-cols-3 items-end gap-2 sm:gap-3">
          {[podium[1]!, podium[0]!, podium[2]!].map((row, podiumIdx) => {
            // podiumIdx 0 = 2nd place, 1 = 1st place, 2 = 3rd place
            const rankIdx = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2;
            const theme = PODIUM_THEME[rankIdx]!;
            const isMe = row.userId === user.id;
            return (
              <StaggerItem
                key={row.id}
                className={cn(
                  "comic-panel flex min-w-0 flex-col items-center gap-1.5 bg-surface p-2.5 text-center transition-transform sm:gap-2 sm:p-4",
                  theme.scale
                )}
              >
                <span className={cn("sticker flex h-6 w-6 shrink-0 items-center justify-center sm:h-8 sm:w-8", theme.ring)}>
                  <Medal className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", theme.medal)} />
                </span>
                <div className="sticker shrink-0 rounded-full bg-surface p-0.5">
                  <Avatar
                    src={row.user.avatarUrl}
                    name={row.user.firstName}
                    size={48}
                    className="h-9 w-9 font-display sm:h-12 sm:w-12"
                    fallbackClassName="h-9 w-9 font-display sm:h-12 sm:w-12"
                  />
                </div>
                <p className="line-clamp-1 w-full text-[11px] font-bold text-foreground sm:text-xs">
                  {row.user.firstName}
                  {isMe && <span className="text-accent"> (you)</span>}
                </p>
                <span className="text-[9px] font-semibold text-muted-foreground sm:text-[10px]">
                  Lvl {xpProgressWithinLevel(row.xp).level}
                </span>
                <span className="font-mono text-[11px] font-bold text-xp sm:text-xs">
                  {row.xp.toLocaleString("en-US")} XP
                </span>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      <StaggerContainer className="comic-panel mt-6 divide-y divide-border/10 bg-surface">
        {rest.map((row, i) => {
          const isMe = row.userId === user.id;
          return (
            <StaggerItem
              key={row.id}
              className={cn("flex items-center gap-3 p-3 sm:gap-4 sm:p-4", isMe && "bg-primary/10")}
            >
              <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-muted-foreground">
                {i + 4}
              </span>
              <Avatar src={row.user.avatarUrl} name={row.user.firstName} size={32} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.user.firstName} {row.user.lastName}
                  {isMe && <span className="ml-1.5 text-xs text-accent">(you)</span>}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  Level {xpProgressWithinLevel(row.xp).level}
                </p>
              </div>
              {row.currentStreak > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-danger" /> {row.currentStreak}
                </span>
              )}
              <span className="font-mono text-sm font-semibold text-xp">
                {row.xp.toLocaleString("en-US")} XP
              </span>
            </StaggerItem>
          );
        })}

        {myRankRow && myRank && (
          <div className="flex items-center gap-3 bg-primary/10 p-3 sm:gap-4 sm:p-4">
            <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-muted-foreground">
              {myRank}
            </span>
            <Avatar
              src={myRankRow.user.avatarUrl}
              name={myRankRow.user.firstName}
              size={32}
              className="h-8 w-8"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {myRankRow.user.firstName} {myRankRow.user.lastName}{" "}
                <span className="text-xs text-accent">(you)</span>
              </p>
            </div>
            <span className="font-mono text-sm font-semibold text-xp">
              {myRankRow.xp.toLocaleString("en-US")} XP
            </span>
          </div>
        )}

        {rest.length === 0 && !myRankRow && podium.length < 3 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Not enough heroes on the board yet.
          </p>
        )}
      </StaggerContainer>
    </div>
  );
}
