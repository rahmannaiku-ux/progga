import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Coins,
  Flame,
  MessageCircle,
  PlayCircle,
  Radio,
  Rocket,
  Trophy,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";

/**
 * Lightweight, illustrative previews of screens that really exist in
 * Proggaa (mission progress, the Patrol viewer, the exam runner, results,
 * the live room, the progress HUD, a medal). They are server-rendered
 * markup only: no data, no client JS. Every preview is aria-hidden; the
 * section copy next to it carries the meaning. XP values come from the
 * real reward table; everything else is sample content, labelled as such.
 */

function PreviewTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
      {children}
    </span>
  );
}

function Bar({ fill, className, barClassName }: { fill: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full border-[2.5px] border-border bg-surface", className)}>
      <div
        className={cn("lp-fill h-full rounded-full bg-accent", barClassName)}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
      />
    </div>
  );
}

/** Hero: a mission in progress, with the XP and streak it feeds. */
export function HeroMissionPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm sm:max-w-md">
      <div className="comic-panel bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="sticker inline-flex items-center gap-1.5 bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
            <Rocket className="h-3.5 w-3.5" /> Mission
          </span>
          <PreviewTag>Preview</PreviewTag>
        </div>
        <p className="mt-3 font-cartoon text-xl font-extrabold leading-tight text-foreground">Your next Mission</p>
        <p className="text-sm text-muted-foreground">Operation 2 · Patrol 3 of 5</p>
        <Bar fill={60} className="mt-3" />

        <ul className="mt-4 space-y-2">
          {[
            { t: "Patrol 1", done: true },
            { t: "Patrol 2", done: true },
            { t: "Patrol 3", done: false },
          ].map((p) => (
            <li
              key={p.t}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-xl border-2 px-3 text-sm font-semibold",
                p.done ? "border-border/40 bg-muted/50 text-muted-foreground" : "border-accent bg-accent/10 text-foreground"
              )}
            >
              {p.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
              ) : (
                <PlayCircle className="h-4 w-4 shrink-0 text-accent" />
              )}
              {p.t}
              {!p.done && (
                <span className="ml-auto rounded-full bg-xp px-2 py-0.5 font-mono text-[11px] font-bold text-xp-foreground">
                  +{XP_REWARDS.LESSON_COMPLETE} XP
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="sticker absolute -top-4 right-2 flex items-center gap-1.5 bg-xp px-3 py-1.5 text-sm font-bold text-xp-foreground sm:-right-3">
        <Zap className="h-4 w-4 fill-current" /> XP
      </div>
      <div className="sticker absolute -bottom-4 left-2 flex items-center gap-1.5 bg-surface px-3 py-1.5 text-sm font-bold text-foreground sm:-left-3">
        <Flame className="h-4 w-4 fill-danger text-danger" /> Streak
      </div>
    </div>
  );
}

/** The Patrol (lesson) viewer: video, completion and the XP it pays. */
export function PatrolViewerPreview() {
  return (
    <div aria-hidden="true" className="comic-panel overflow-hidden bg-surface">
      <div className="relative flex aspect-video items-center justify-center bg-[#19122B]">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/40 via-transparent to-accent/30" />
        <PlayCircle className="relative h-14 w-14 text-white/90" strokeWidth={1.5} />
        <div className="absolute inset-x-3 bottom-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="lp-fill h-full rounded-full bg-xp" style={{ "--fill": "42%" } as React.CSSProperties} />
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-cartoon text-lg font-bold text-foreground">Patrol 3 · Lesson title</p>
          <span className="sticker px-2.5 py-0.5 font-mono text-xs font-bold text-foreground">3/5</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
          <span className="rounded-md bg-muted px-2.5 py-1">Notes</span>
          <span className="rounded-md bg-muted px-2.5 py-1">Resources</span>
          <span className="rounded-md bg-muted px-2.5 py-1">Discussion</span>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Mark complete
          </span>
          <span className="rounded-full bg-xp px-2 py-0.5 font-mono text-xs text-xp-foreground">
            +{XP_REWARDS.LESSON_COMPLETE} XP
          </span>
        </div>
      </div>
    </div>
  );
}

/** The exam runner: timer, question, options, progress. */
export function ExamPreview() {
  const options = ["Option A", "Option B", "Option C", "Option D"];
  return (
    <div aria-hidden="true" className="comic-panel bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 rounded-xl border-2 border-border/60 px-3 py-1.5 font-mono text-base font-extrabold tabular-nums text-foreground">
          <Clock className="h-4 w-4 text-accent" /> 12:34
        </span>
        <span className="text-xs font-semibold text-muted-foreground">4/10</span>
        <PreviewTag>Sample</PreviewTag>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="lp-fill h-full rounded-full bg-accent" style={{ "--fill": "40%" } as React.CSSProperties} />
      </div>
      <p className="mt-4 text-base font-semibold leading-snug text-foreground">Question 4 of 10</p>
      <div className="mt-3 space-y-2">
        {options.map((o, i) => (
          <div
            key={o}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl border-2 px-3 text-sm font-medium",
              i === 1 ? "border-accent bg-accent/10 text-foreground" : "border-border/60 text-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-bold",
                i === 1 ? "border-accent bg-accent text-accent-foreground" : "border-border/60 text-muted-foreground"
              )}
            >
              {String.fromCharCode(65 + i)}
            </span>
            {o}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The result screen: score and the per-question breakdown. */
export function ResultPreview() {
  const rows = [
    { q: "Q1", ok: true },
    { q: "Q2", ok: true },
    { q: "Q3", ok: false },
    { q: "Q4", ok: true },
  ];
  return (
    <div aria-hidden="true" className="comic-panel bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="sticker inline-flex items-center gap-1.5 bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
          <BadgeCheck className="h-3.5 w-3.5" /> Passed
        </span>
        <PreviewTag>Sample</PreviewTag>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="font-cartoon text-5xl font-extrabold leading-none text-foreground">80%</p>
        <p className="pb-1 text-sm text-muted-foreground">8 of 10 correct</p>
      </div>
      <Bar fill={80} className="mt-3" />
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li
            key={r.q}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl border-l-[6px] bg-muted/40 px-3 text-sm font-semibold text-foreground",
              r.ok ? "border-l-accent" : "border-l-danger"
            )}
          >
            {r.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-danger" />
            )}
            {r.q}
            <span className="ml-auto text-xs font-medium text-muted-foreground">{r.ok ? "Correct" : "Review"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The live room: video area, live badge, chat. */
export function LiveRoomPreview() {
  const messages = ["Ready for class!", "Can you repeat that step?", "Got it, thanks!"];
  return (
    <div aria-hidden="true" className="comic-panel overflow-hidden bg-surface">
      <div className="relative flex aspect-video items-center justify-center bg-[#19122B]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-transparent to-accent/30" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white">
          <Radio className="h-3.5 w-3.5 animate-pulse motion-reduce:animate-none" /> LIVE
        </span>
        <Users className="relative h-12 w-12 text-white/85" strokeWidth={1.5} />
      </div>
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5" /> Live chat
        </p>
        {messages.map((m, i) => (
          <p key={m} className={cn("w-fit max-w-[85%] rounded-xl px-3 py-2 text-sm", i === 2 ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}

/** The progress HUD: level, XP, streak, coins, achievements. */
export function ProgressHudPreview() {
  return (
    <div aria-hidden="true" className="comic-panel bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="sticker flex h-11 w-11 items-center justify-center bg-xp font-mono text-sm font-extrabold text-xp-foreground">
            Lv.3
          </span>
          <div>
            <p className="font-cartoon text-base font-bold leading-tight text-foreground">Your hero profile</p>
            <p className="text-xs text-muted-foreground">Keeps every bit of progress</p>
          </div>
        </div>
        <PreviewTag>Preview</PreviewTag>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-bold text-foreground">
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 fill-xp text-xp" /> XP
          </span>
          <span className="font-mono text-muted-foreground">to next level</span>
        </div>
        <Bar fill={68} className="mt-1.5" barClassName="bg-xp" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="sticker flex items-center gap-2 bg-surface px-3 py-2.5">
          <Flame className="h-5 w-5 fill-danger text-danger" />
          <span className="text-sm font-bold text-foreground">Streak</span>
        </div>
        <div className="sticker flex items-center gap-2 bg-surface px-3 py-2.5">
          <Coins className="h-5 w-5 text-xp" />
          <span className="text-sm font-bold text-foreground">Coins</span>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-center gap-2" >
        {[
          { h: "h-14", l: "2" },
          { h: "h-20", l: "1" },
          { h: "h-10", l: "3" },
        ].map((b) => (
          <div key={b.l} className="flex flex-1 flex-col items-center">
            <Trophy className={cn("mb-1 h-4 w-4", b.l === "1" ? "text-xp" : "text-muted-foreground")} />
            <div className={cn("w-full rounded-t-xl border-2 border-border/60 text-center font-mono text-sm font-bold leading-[2rem]", b.h, b.l === "1" ? "bg-xp text-xp-foreground" : "bg-muted text-muted-foreground")}>
              {b.l}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">Leaderboard</p>
    </div>
  );
}

/** A medal / certificate. */
export function MedalPreview() {
  return (
    <div aria-hidden="true" className="comic-panel halftone-dots relative overflow-hidden bg-surface p-5 text-center sm:p-6">
      <PreviewTag>Sample</PreviewTag>
      <div className="sticker mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full bg-xp">
        <Award className="h-8 w-8 text-xp-foreground" />
      </div>
      <p className="mt-3 font-cartoon text-xl font-extrabold text-foreground">Certificate of Completion</p>
      <p className="mt-1 text-sm text-muted-foreground">Awarded for finishing a Mission</p>
      <div className="mx-auto mt-4 h-px w-2/3 bg-border/40" />
      <p className="mt-3 font-mono text-xs font-bold tracking-wider text-muted-foreground">PRG-XXXX-XXXX-XXXX</p>
      <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">
        <BadgeCheck className="h-4 w-4" /> Verifiable online
      </p>
    </div>
  );
}

