"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resetLeaderboardAction, setLeaderboardScheduleAction } from "@/server/actions/leaderboard-actions";
import type { ResetSchedule } from "@/lib/gamification/leaderboard";

const OPTIONS: { value: ResetSchedule; label: string; hint: string }[] = [
  { value: "NEVER", label: "Never", hint: "Only when you click Reset now" },
  { value: "DAILY", label: "Daily", hint: "Every day at 00:00 (Dhaka)" },
  { value: "WEEKLY", label: "Weekly", hint: "Every Sunday at 00:00 (Dhaka)" },
  { value: "MONTHLY", label: "Monthly", hint: "The 1st of each month, 00:00 (Dhaka)" },
];

export function LeaderboardScheduleControl({ current }: { current: ResetSchedule }) {
  const router = useRouter();
  const [value, setValue] = useState<ResetSchedule>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(next: ResetSchedule) {
    if (next === value || isPending) return;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setLeaderboardScheduleAction(next);
      if (!result.ok) {
        setValue(previous);
        setError(result.error ?? "Couldn't save the schedule.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Automatic reset schedule">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={isPending}
            onClick={() => choose(o.value)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
              value === o.value ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/50"
            )}
          >
            <span className="block text-sm font-bold text-foreground">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ResetLeaderboardButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setError(null);
    startTransition(async () => {
      try {
        await resetLeaderboardAction();
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't reset the leaderboard.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" /> Reset now
        </Button>
      </DialogTrigger>
      <DialogContent title="Reset the leaderboard?" description="Starts a fresh ranking period from this moment." className="max-w-md">
        <div className="space-y-4 p-4">
          <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p>
              Every student&apos;s leaderboard score goes back to 0 and ranks start over. Their total XP, levels,
              coins and achievements are <span className="font-bold">not</span> affected, and the All-Time tab keeps
              showing total XP.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" onClick={reset} disabled={isPending}>
              {isPending ? "Resetting..." : "Reset leaderboard"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
