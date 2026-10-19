"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Flag, GraduationCap, Loader2, Lock, MessageCircle, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { REPORT_REASONS, splitLinks } from "@/lib/community/rules";
import { reportContent, toggleFollow, toggleGroupMembership } from "@/server/actions/community-actions";
import { openConversation } from "@/server/actions/message-actions";
import type { PersonDTO } from "@/server/services/community";

// Small pieces shared across the community screens.

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";

/**
 * User-written text. Rendered as text nodes (React escapes them), with
 * plain http(s) links turned into real anchors. No HTML is ever injected.
 */
export function RichText({ text, className, plain = false }: { text: string; className?: string; plain?: boolean }) {
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {splitLinks(text).map((part, i) =>
        part.type === "link" && !plain ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="font-semibold text-accent underline underline-offset-2 hover:text-accent/80"
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  );
}

export function PersonLink({ person, size = 40, subtitle }: { person: PersonDTO; size?: number; subtitle?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`/community/u/${person.id}`} prefetch={false} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Avatar fallbackClassName="bg-primary/15 text-primary" src={person.avatarUrl} name={person.name} size={size} />
      </Link>
      <div className="min-w-0">
        <Link
          href={`/community/u/${person.id}`}
          prefetch={false}
          className="flex items-center gap-1 truncate text-sm font-bold text-foreground hover:underline"
        >
          <span className="truncate">{person.name}</span>
          {person.isMentor && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              <GraduationCap className="h-3 w-3" aria-hidden="true" /> Mentor
            </span>
          )}
        </Link>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

export function FollowButton({
  userId,
  initialFollowing,
  size = "md",
  onChange,
}: {
  userId: string;
  initialFollowing: boolean;
  size?: "sm" | "md";
  onChange?: (state: { following: boolean; followerCount: number }) => void;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await toggleFollow(userId);
        if (!res.ok) return setError(res.error);
        setFollowing(res.following);
        onChange?.(res);
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={following}
        className={cn(
          "comic-btn inline-flex shrink-0 items-center justify-center gap-1.5 font-bold transition-colors disabled:opacity-60",
          size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm",
          following ? "border border-border/60 bg-surface text-foreground" : "bg-accent text-accent-foreground"
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : following ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        )}
        {following ? "Following" : "Follow"}
      </button>
      {error && <span role="alert" className="max-w-[14rem] text-right text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

export function JoinGroupButton({
  groupId,
  initialJoined,
  isOwner,
  privacy = "PUBLIC",
  initialRequested = false,
  size = "md",
}: {
  groupId: string;
  initialJoined: boolean;
  isOwner: boolean;
  /** A private group is joined by request: the button asks, then shows "Requested" (press again to cancel). */
  privacy?: "PUBLIC" | "PRIVATE";
  initialRequested?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [requested, setRequested] = useState(initialRequested);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isOwner) {
    return (
      <span className="inline-flex h-9 items-center gap-1 rounded-full bg-xp/25 px-3 text-xs font-bold text-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> You run this group
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        aria-pressed={joined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await toggleGroupMembership(groupId);
              if (!res.ok) return setError(res.error);
              setJoined(res.joined);
              setRequested(res.requested);
              router.refresh();
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className={cn(
          "comic-btn inline-flex shrink-0 items-center justify-center gap-1.5 font-bold disabled:opacity-60",
          size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm",
          joined || requested ? "border border-border/60 bg-surface text-foreground" : "bg-accent text-accent-foreground"
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : joined ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : requested ? (
          <Clock className="h-4 w-4" aria-hidden="true" />
        ) : privacy === "PRIVATE" ? (
          <Lock className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Users className="h-4 w-4" aria-hidden="true" />
        )}
        {joined ? "Joined" : requested ? "Requested" : privacy === "PRIVATE" ? "Request to join" : "Join group"}
      </button>
      {error && <span role="alert" className="max-w-[14rem] text-right text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

export function MessageButton({ userId, size = "md" }: { userId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await openConversation(userId);
              if (!res.ok) return setError(res.error);
              router.push(`/community/messages/${res.conversationId}`);
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className={cn(
          "comic-btn inline-flex shrink-0 items-center justify-center gap-1.5 border border-border/60 bg-surface font-bold text-foreground disabled:opacity-60",
          size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm"
        )}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
        Message
      </button>
      {error && <span role="alert" className="max-w-[16rem] text-right text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

/** Inline "report this" form. `onDone` closes it. */
export function ReportForm({
  targetType,
  targetId,
  onDone,
}: {
  targetType: "POST" | "COMMENT" | "PROFILE";
  targetId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<{ error?: string; sent?: boolean }>({});
  const [isPending, startTransition] = useTransition();

  if (state.sent) {
    return (
      <div role="status" className="rounded-xl border border-border/40 bg-muted/60 p-3 text-sm text-foreground">
        Thanks. A moderator will look at it.{" "}
        <button type="button" onClick={onDone} className="font-bold text-accent underline underline-offset-2">
          Close
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2 rounded-xl border border-border/40 bg-muted/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState({});
        startTransition(async () => {
          try {
            const res = await reportContent({ targetType, targetId, reason, details });
            setState(res.ok ? { sent: true } : { error: res.error });
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report to the moderators
      </p>
      <label className="block text-xs text-muted-foreground">
        <span className="sr-only">Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-11 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Anything the moderators should know? (optional)"
        aria-label="Details"
        className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
      />
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="comic-btn h-10 bg-danger px-4 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "Sending..." : "Send report"}
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
