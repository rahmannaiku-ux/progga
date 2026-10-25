"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Check, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/payments/format";
import { cn } from "@/lib/utils";
import { requestMissionSwitchAction, switchMissionAction } from "@/server/actions/course-migration-actions";

export type SwitchTarget = {
  id: string;
  title: string;
  category: string | null;
  thumb: string | null;
  priceCents: number;
  differenceCents: number;
};

/**
 * Pick the mission to move to, see what it costs, confirm. In "request" mode (the student's own
 * switch is used up) the confirm step asks for a reason and sends it to the admins instead.
 */
export function MissionSwitchPicker({
  fromCourseId,
  targets,
  mode,
}: {
  fromCourseId: string;
  targets: SwitchTarget[];
  mode: "self" | "request";
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? targets.filter((t) => `${t.title} ${t.category ?? ""}`.toLowerCase().includes(q)) : targets;
  }, [query, targets]);
  const selected = targets.find((t) => t.id === selectedId) ?? null;

  function confirm() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode === "self"
          ? await switchMissionAction(fromCourseId, selected.id)
          : await requestMissionSwitchAction(fromCourseId, selected.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      if (result.status === "AWAITING_PAYMENT") router.push(`/payments/${result.paymentId}`);
      else if (result.status === "COMPLETED") router.push(`/missions/${selected.id}`);
      else router.refresh();
    });
  }

  if (targets.length === 0) {
    return <p className="comic-panel bg-surface p-4 text-sm text-muted-foreground">There are no other missions to switch to right now.</p>;
  }

  return (
    <section aria-label="Missions you can switch to" className="space-y-4">
      {mode === "request" && (
        <p className="rounded-xl border border-xp/40 bg-xp/10 p-3 text-sm text-foreground">
          You&apos;ve used your own switch. Pick a mission and tell us why. An admin will look at your request.
        </p>
      )}

      <label className="relative block">
        <span className="sr-only">Search missions</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search missions"
          className="h-11 w-full rounded-xl border border-border/60 bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </label>

      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((t) => {
          const isSelected = t.id === selectedId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                aria-pressed={isSelected}
                className={cn(
                  "comic-panel flex w-full items-center gap-3 bg-surface p-3 text-left transition-colors",
                  isSelected ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50"
                )}
              >
                <span className="relative flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {t.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by /api/files or Drive
                    <img src={t.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <BookOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-display text-sm font-bold text-foreground">{t.title}</span>
                  {t.category && <span className="block truncate text-xs text-muted-foreground">{t.category}</span>}
                  <span className="mt-1 block text-xs font-semibold">
                    {t.differenceCents > 0 ? (
                      <span className="text-foreground">Pay {formatMoney(t.differenceCents)} more</span>
                    ) : (
                      <span className="text-accent">Free switch</span>
                    )}
                  </span>
                </span>
                {isSelected && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No mission matches &ldquo;{query}&rdquo;.</p>}

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 lg:bottom-4">
        <div className="comic-panel flex flex-wrap items-center justify-between gap-3 bg-surface p-3">
          <p className="min-w-0 text-sm text-muted-foreground">
            {selected ? (
              <>
                Switch to <span className="font-semibold text-foreground">{selected.title}</span>
                {selected.differenceCents > 0 ? ` · ${formatMoney(selected.differenceCents)} to pay` : " · free"}
              </>
            ) : (
              "Pick the mission you want."
            )}
          </p>
          <Button type="button" disabled={!selected} onClick={() => setConfirmOpen(true)}>
            {mode === "self" ? "Continue" : "Ask an admin"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !isPending && setConfirmOpen(o)}>
        <DialogContent
          title={mode === "self" ? "Switch your mission?" : "Ask for a switch"}
          description={selected ? `Move to ${selected.title}` : undefined}
        >
          {selected && (
            <div className="space-y-4 p-5 text-sm">
              {mode === "self" ? (
                <ul className="list-disc space-y-1.5 pl-5 text-foreground">
                  <li>You lose access to your current mission when the switch finishes.</li>
                  <li>
                    {selected.differenceCents > 0
                      ? `You pay ${formatMoney(selected.differenceCents)}, the difference in price. The switch finishes once the payment is checked.`
                      : "It's free: the new mission costs the same or less."}
                  </li>
                  <li>This is your one switch. After it, further switches need an admin.</li>
                </ul>
              ) : (
                <label className="block">
                  <span className="font-semibold text-foreground">Why do you want to switch?</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    className="mt-1.5 w-full rounded-xl border border-border/60 bg-background p-3 text-foreground focus:border-primary focus:outline-none"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {selected.differenceCents > 0
                      ? `If approved, you'll pay the difference of ${formatMoney(selected.differenceCents)} unless the admin waives it.`
                      : "If approved, the switch is free."}
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="button" className="flex-1" disabled={isPending} onClick={confirm}>
                  {isPending
                    ? "Working..."
                    : mode === "request"
                      ? "Send request"
                      : selected.differenceCents > 0
                        ? "Continue to payment"
                        : "Switch now"}
                </Button>
                <Button type="button" variant="outline" className="flex-1" disabled={isPending} onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
