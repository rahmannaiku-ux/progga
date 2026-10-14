import Link from "next/link";
import { Coins, Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Cake } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatDhakaDate, formatDhakaDateTimeBST } from "@/lib/timezone";
import { nonExpiringBalance } from "@/lib/gamification/coin-lots";
import { expireDueCoinLots } from "@/lib/gamification/coins";
import { getBirthdayOverview } from "@/server/services/birthday";
import { BirthdayRewardCard } from "@/components/birthday/birthday-reward-card";

export default async function WalletPage() {
  const user = await getCurrentUser();

  // Remove any birthday coins that reached their expiry first, so the
  // balance and the lots read below agree (cheap when nothing is due).
  const now = new Date();
  await expireDueCoinLots({ userId: user.id, now }).catch(() => undefined);
  const [stats, transactions, activeLots, birthday] = await Promise.all([
    db.heroStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { coinBalance: true },
    }),
    db.proggyCoinTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.coinRewardLot.findMany({
      where: { userId: user.id, expiredAt: null, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: { remaining: true, expiresAt: true },
    }),
    getBirthdayOverview(user.id, now),
  ]);
  const expiringTotal = activeLots.reduce((sum, l) => sum + l.remaining, 0);
  const latestBirthday = birthday.rewards[0];

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <WalletIcon className="h-6 w-6 text-xp" /> Wallet
      </h1>

      <div className="comic-panel mt-4 flex items-center justify-center gap-2 bg-surface p-6">
        <Coins className="h-6 w-6 text-xp" />
        <span className="font-mono text-2xl font-extrabold text-foreground">
          {stats.coinBalance}
        </span>
        <span className="text-sm text-muted-foreground">Proggy Coins</span>
      </div>

      {expiringTotal > 0 && (
        <div className="comic-panel mt-3 bg-surface p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <Cake className="h-4 w-4 text-accent" aria-hidden="true" /> Birthday coins
            </span>
            <span className="font-mono font-bold text-foreground">{expiringTotal.toLocaleString("en-US")}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Expire {formatDhakaDateTimeBST(activeLots[0]!.expiresAt)} and are spent first.
          </p>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/10 pt-2">
            <span className="text-muted-foreground">Coins that never expire</span>
            <span className="font-mono font-bold text-foreground">
              {nonExpiringBalance(stats.coinBalance, activeLots).toLocaleString("en-US")}
            </span>
          </div>
        </div>
      )}

      {latestBirthday && (
        <div className="mt-4">
          <BirthdayRewardCard reward={latestBirthday} compact />
          <Link href="/birthday" className="mt-2 inline-block text-xs font-semibold text-accent hover:text-accent/80">
            Birthday rewards →
          </Link>
        </div>
      )}

      <h2 className="mb-2 mt-6 font-display text-sm font-bold text-foreground">Recent Activity</h2>
      <div className="space-y-2">
        {transactions.map((t) => (
          <div key={t.id} className="comic-panel flex items-center justify-between gap-3 bg-surface p-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={
                  "sticker flex h-8 w-8 shrink-0 items-center justify-center " +
                  (t.amount >= 0 ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger")
                }
              >
                {t.amount >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{t.reason}</p>
                <p className="text-[11px] text-muted-foreground">{formatDhakaDate(t.createdAt)}</p>
              </div>
            </div>
            <span
              className={
                "shrink-0 font-mono text-sm font-bold " +
                (t.amount >= 0 ? "text-accent" : "text-danger")
              }
            >
              {t.amount >= 0 ? "+" : ""}
              {t.amount}
            </span>
          </div>
        ))}
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">No coin activity yet.</p>
        )}
      </div>
    </div>
  );
}
