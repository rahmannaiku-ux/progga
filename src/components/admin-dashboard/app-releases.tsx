"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, Rocket, Undo2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDhakaDateTime } from "@/lib/timezone";
import { loadReleaseRuns, publishAppVersion, setAppReleaseWithdrawn, setMinimumAppVersions } from "@/server/actions/app-release-actions";
import type { ReleaseRunDTO } from "@/server/services/app-releases";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const INPUT = "h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const LABEL = "mb-1.5 block text-xs font-bold text-foreground";

/** Publish a new version of both apps: version + what's new, then the build runs on GitHub. */
export function PublishVersionForm({ suggested, disabled }: { suggested: string; disabled: boolean }) {
  const router = useRouter();
  const [version, setVersion] = useState(suggested);
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<{ error?: string; started?: string }>({});
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(`Publish Proggaa ${version} for Windows and Android? Everyone with the app will be offered it.`)) return;
        setState({});
        startTransition(async () => {
          try {
            const res = await publishAppVersion({ version, notes });
            if (!res.ok) return setState({ error: res.error });
            setState({ started: version });
            setNotes("");
            router.refresh();
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className={LABEL} htmlFor="app-version">New version</label>
          <input id="app-version" value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder="1.0.3" className={cn(INPUT, "font-mono")} />
        </div>
        <div>
          <label className={LABEL} htmlFor="app-notes">What&apos;s new (shown in the update prompt)</label>
          <textarea
            id="app-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1500}
            rows={3}
            placeholder="e.g. Faster start-up and smoother reels."
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.started && (
        <p role="status" className="text-xs font-semibold text-accent">
          Building {state.started}. It takes about 15 minutes; follow it under Builds below.
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || isPending || !version}
        className="comic-btn flex h-11 items-center gap-1.5 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Rocket className="h-4 w-4" aria-hidden="true" />}
        Publish {version || "version"}
      </button>
    </form>
  );
}

/** The latest builds, refreshing while one is running. */
export function ReleaseRuns({ initial }: { initial: ReleaseRunDTO[] }) {
  const router = useRouter();
  const [runs, setRuns] = useState(initial);
  const running = runs.some((r) => r.status !== "completed");

  useEffect(() => setRuns(initial), [initial]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const res = await loadReleaseRuns();
        if (!res.ok) return;
        const wasRunning = runs.some((r) => r.status !== "completed");
        setRuns(res.runs);
        // A build just finished: reload so the new release shows in the list.
        if (wasRunning && res.runs.every((r) => r.status === "completed")) router.refresh();
      } catch {
        // The next refresh catches up.
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [running, runs, router]);

  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No builds yet.</p>;
  return (
    <ul className="divide-y divide-border/15">
      {runs.map((r) => {
        const icon =
          r.status !== "completed" ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
          ) : r.conclusion === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
          ) : r.conclusion === "cancelled" || r.conclusion === "skipped" ? (
            <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
          );
        const label =
          r.status === "queued" ? "Waiting to start" : r.status !== "completed" ? "Building…" : r.conclusion === "success" ? "Published" : r.conclusion === "cancelled" ? "Cancelled" : "Failed";
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
            {icon}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {label} · {formatDhakaDateTime(r.startedAt)}
              </p>
            </div>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-bold text-accent hover:underline">
              Details <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Withdraw a broken release (apps stop being offered it) or put it back. */
export function WithdrawReleaseButton({ id, version, withdrawn, disabled }: { id: number; version: string; withdrawn: boolean; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          const ask = withdrawn
            ? `Put ${version} back? If it's the newest, apps will be offered it again.`
            : `Withdraw ${version}? New downloads and updates go back to the previous version. Apps already on ${version} keep it until a newer version is published.`;
          if (!window.confirm(ask)) return;
          setError(null);
          startTransition(async () => {
            try {
              const res = await setAppReleaseWithdrawn({ id, version, withdrawn: !withdrawn });
              if (!res.ok) return setError(res.error);
              router.refresh();
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className={cn(
          "flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold disabled:opacity-50",
          withdrawn ? "text-accent hover:bg-accent/10" : "text-danger hover:bg-danger/10"
        )}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : withdrawn ? <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {withdrawn ? "Put back" : "Withdraw"}
      </button>
      {error && <span role="alert" className="max-w-[16rem] text-right text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

/** The oldest app versions allowed; older apps must update before they continue. */
export function MinimumVersionForm({ android, windows, disabled }: { android: string; windows: string; disabled: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(android);
  const [w, setW] = useState(windows);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState({});
        startTransition(async () => {
          try {
            const res = await setMinimumAppVersions({ android: a, windows: w });
            setState(res.ok ? { saved: true } : { error: res.error });
            if (res.ok) router.refresh();
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="min-android">Android: oldest allowed</label>
          <input id="min-android" value={a} onChange={(e) => setA(e.target.value.trim())} placeholder="No minimum" className={cn(INPUT, "font-mono")} />
        </div>
        <div>
          <label className={LABEL} htmlFor="min-windows">Windows: oldest allowed</label>
          <input id="min-windows" value={w} onChange={(e) => setW(e.target.value.trim())} placeholder="No minimum" className={cn(INPUT, "font-mono")} />
        </div>
      </div>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.saved && <p role="status" className="text-xs font-semibold text-accent">Saved. Apps pick it up within a minute.</p>}
      <button
        type="submit"
        disabled={disabled || isPending}
        className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-50"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save
      </button>
    </form>
  );
}
