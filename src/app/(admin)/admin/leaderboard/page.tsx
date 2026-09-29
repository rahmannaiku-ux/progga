import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { getLeaderboardPeriod } from "@/lib/gamification/leaderboard";
import { LeaderboardScheduleControl, ResetLeaderboardButton } from "@/components/admin-dashboard/leaderboard-reset-controls";

export default async function AdminLeaderboardPage() {
  await requireRole("ADMIN");

  const [period, history] = await Promise.all([
    getLeaderboardPeriod(),
    db.leaderboardReset.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Resetting only restarts the ranking. Students keep their XP, levels, coins and achievements.
      </p>

      <div className="glass-panel mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-foreground">Current period</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {period.start ? (
                <>
                  Ranking XP earned since{" "}
                  <span className="font-semibold text-foreground">{formatDhakaDateTime(period.start)}</span>
                </>
              ) : (
                "No reset yet — ranking total XP of all time."
              )}
            </p>
          </div>
          <ResetLeaderboardButton />
        </div>
        <Link href="/leaderboard" className="mt-3 inline-block text-xs font-semibold text-accent hover:text-accent/80">
          View leaderboard →
        </Link>
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Automatic reset</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          The board also starts over on this schedule. A manual reset still takes effect immediately.
        </p>
        <LeaderboardScheduleControl current={period.schedule} />
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Manual reset history</h2>
        {history.length > 0 ? (
          <ul className="mt-3 divide-y divide-border/10">
            {history.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">{formatDhakaDateTime(r.createdAt)}</span>
                <span className="text-muted-foreground">{r.resetByName ?? "Admin"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No manual resets yet.</p>
        )}
      </div>
    </div>
  );
}
