import Link from "next/link";
import { Cake, Clock3, Coins } from "lucide-react";
import { formatDhakaDateTimeBST } from "@/lib/timezone";
import { birthdayRewardStatus } from "@/lib/birthday/reward-rules";
import { cn } from "@/lib/utils";

export type BirthdayRewardView = {
  id: string;
  year: number;
  amount: number;
  grantedAt: Date;
  expiresAt: Date;
  remaining: number;
  expiredAt: Date | null;
  expiredAmount: number;
};

const STATUS_LABEL = { active: "Active", spent: "All spent", expired: "Expired" } as const;

/**
 * One birthday reward: when it was granted, what's left, and exactly when
 * it expires (Bangladesh time). Shown on /birthday and in the wallet.
 */
export function BirthdayRewardCard({ reward, compact = false }: { reward: BirthdayRewardView; compact?: boolean }) {
  const status = birthdayRewardStatus(reward);
  const spent = Math.max(0, reward.amount - reward.remaining - reward.expiredAmount);
  const pct = reward.amount > 0 ? Math.round((reward.remaining / reward.amount) * 100) : 0;

  return (
    <article
      aria-label={`Birthday reward ${reward.year}`}
      className={cn(
        "comic-panel relative overflow-hidden p-4 sm:p-5",
        status === "active" ? "border-2 border-[#FAB719] bg-[#19122B] text-[#FCF9F3]" : "bg-surface text-foreground"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              status === "active" ? "bg-[#53328B] ring-2 ring-[#FAB719]" : "bg-muted"
            )}
          >
            <Cake className={cn("h-5 w-5", status === "active" ? "text-[#FAB719]" : "text-muted-foreground")} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-extrabold leading-tight">Birthday Reward — {reward.year}</h3>
            <p className={cn("text-xs", status === "active" ? "text-[#FCF9F3]/70" : "text-muted-foreground")}>
              Granted {formatDhakaDateTimeBST(reward.grantedAt)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "sticker shrink-0 px-2 py-0.5 text-[11px] font-bold",
            status === "active" && "bg-[#FAB719] text-[#19122B]",
            status === "spent" && "bg-accent/15 text-accent",
            status === "expired" && "bg-danger/15 text-danger"
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className={cn("text-xs font-semibold", status === "active" ? "text-[#FCF9F3]/70" : "text-muted-foreground")}>
            Left to spend
          </p>
          <p className="flex items-center gap-1.5 font-mono text-2xl font-extrabold">
            <Coins className={cn("h-5 w-5", status === "active" ? "text-[#FAB719]" : "text-xp-ink")} aria-hidden="true" />
            {reward.remaining.toLocaleString("en-US")}
            <span className={cn("text-sm font-semibold", status === "active" ? "text-[#FCF9F3]/70" : "text-muted-foreground")}>
              / {reward.amount.toLocaleString("en-US")}
            </span>
          </p>
        </div>
        {status === "active" && !compact && (
          <Link
            href="/store"
            className="rounded-xl bg-[#FAB719] px-3 py-2 text-sm font-extrabold text-[#19122B] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FCF9F3]/60"
          >
            Spend in store
          </Link>
        )}
      </div>

      <div
        className={cn("mt-3 h-2 overflow-hidden rounded-full", status === "active" ? "bg-white/15" : "bg-muted")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={reward.amount}
        aria-valuenow={reward.remaining}
        aria-label="Birthday coins left"
      >
        <div className="h-full rounded-full bg-[#FAB719]" style={{ width: `${pct}%` }} />
      </div>

      <p className={cn("mt-3 flex items-start gap-1.5 text-xs", status === "active" ? "text-[#FCF9F3]/80" : "text-muted-foreground")}>
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {status === "expired" ? (
          <span>
            Expired {formatDhakaDateTimeBST(reward.expiredAt ?? reward.expiresAt)}.
            {reward.expiredAmount > 0 && ` ${reward.expiredAmount.toLocaleString("en-US")} unspent coins expired.`}
          </span>
        ) : (
          <span>Expires {formatDhakaDateTimeBST(reward.expiresAt)}</span>
        )}
      </p>
      {!compact && spent > 0 && (
        <p className={cn("mt-1 text-xs", status === "active" ? "text-[#FCF9F3]/70" : "text-muted-foreground")}>
          {spent.toLocaleString("en-US")} spent so far.
        </p>
      )}
    </article>
  );
}
