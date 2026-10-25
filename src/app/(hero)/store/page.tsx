import Link from "next/link";
import { Coins, Store, Clock3, Swords, GraduationCap, Cake } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getStoreItemsForStudent } from "@/server/services/store";
import { StoreGrid } from "@/components/course/store-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDhakaDate } from "@/lib/timezone";

export const metadata = { title: "Proggy Store — Proggaa" };

const WAYS_TO_EARN = [
  { icon: Swords, label: "Pass challenges", href: "/my-courses" },
  { icon: GraduationCap, label: "Pass exams", href: "/exams" },
  { icon: Cake, label: "Birthday gift", href: "/birthday" },
] as const;

/**
 * Spend Proggy Coins on extra classes, notes and stickers. Coins come from passed challenges and
 * exams and the birthday gift; birthday coins expire, so the soonest expiry is shown up top.
 */
export default async function StorePage() {
  const user = await getCurrentUser();
  const now = new Date();

  const [items, stats, expiring] = await Promise.all([
    getStoreItemsForStudent(user.id),
    db.heroStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { coinBalance: true },
    }),
    db.coinRewardLot.findFirst({
      where: { userId: user.id, expiredAt: null, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: { remaining: true, expiresAt: true },
    }),
  ]);

  const nextGoal = items
    .filter((i) => !i.owned && i.priceCoins > stats.coinBalance)
    .sort((a, b) => a.priceCoins - b.priceCoins)[0];
  const ownedCount = items.filter((i) => i.owned).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="comic-panel-bold relative overflow-hidden bg-surface p-5 sm:p-6">
        <div className="halftone-dots pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
              <Store className="h-6 w-6 text-primary" aria-hidden="true" /> Proggy Store
            </h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Extra classes, notes and stickers, paid for with the coins you earn while learning.
            </p>
          </div>
          <div className="rounded-2xl border border-xp/50 bg-xp/15 px-4 py-3 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-xp-ink dark:text-xp">Your coins</p>
            <p className="flex items-center justify-end gap-1.5 font-mono text-2xl font-extrabold text-foreground">
              <Coins className="h-5 w-5 text-xp-ink dark:text-xp" aria-hidden="true" />
              {stats.coinBalance.toLocaleString("en-US")}
            </p>
            {ownedCount > 0 && <p className="text-[11px] text-muted-foreground">{ownedCount} item{ownedCount === 1 ? "" : "s"} owned</p>}
          </div>
        </div>

        {expiring && (
          <p className="relative mt-4 flex items-center gap-1.5 rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {expiring.remaining.toLocaleString("en-US")} birthday coins expire on {formatDhakaDate(expiring.expiresAt)}. They&apos;re
            spent first.
          </p>
        )}

        <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Earn coins:</span>
          {WAYS_TO_EARN.map(({ icon: Icon, label, href }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/30 bg-background/60 px-3 font-semibold text-foreground hover:border-primary/50"
            >
              <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {label}
            </Link>
          ))}
        </div>
        {nextGoal && (
          <p className="relative mt-3 text-xs text-muted-foreground">
            {(nextGoal.priceCoins - stats.coinBalance).toLocaleString("en-US")} more coins and you can get{" "}
            <span className="font-semibold text-foreground">{nextGoal.title}</span>.
          </p>
        )}
      </section>

      {items.length === 0 ? (
        <EmptyState
          pose="thinking"
          title="The store is being stocked"
          body="Mentors add extra classes and notes here. Keep earning coins so you're ready when they arrive."
          action={{ href: "/exams", label: "Earn coins in exams" }}
        />
      ) : (
        <StoreGrid items={items} balance={stats.coinBalance} />
      )}
    </div>
  );
}
