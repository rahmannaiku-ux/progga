"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Loader2, Send } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX_LENGTH } from "@/lib/community/rules";
import { formatDhakaTime } from "@/lib/timezone";
import {
  createGroup,
  deleteGroup,
  lookUpUsername,
  setGroupModerator,
  setUsername,
  updateCommunityProfile,
  updateGroup,
} from "@/server/actions/community-actions";
import { loadOlderMessages, pollConversation, sendMessage } from "@/server/actions/message-actions";
import type { MessageDTO } from "@/server/services/community";
import type { UsernameCheck } from "@/server/services/usernames";
import { RichText } from "./bits";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const INPUT = "h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const LABEL = "mb-1.5 block text-xs font-bold text-foreground";

/** Create a group, or (with `group`) edit one the viewer owns. */
export function GroupForm({ group }: { group?: { id: string; name: string; topic: string; description: string } }) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [topic, setTopic] = useState(group?.topic ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
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
            if (group) {
              const res = await updateGroup(group.id, { name, topic, description });
              setState(res.ok ? { saved: true } : { error: res.error });
              if (res.ok) router.refresh();
            } else {
              const res = await createGroup({ name, topic, description });
              if (!res.ok) return setState({ error: res.error });
              router.push(`/community/groups/${res.slug}`);
            }
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div>
        <label className={LABEL} htmlFor="group-name">Group name</label>
        <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. HSC Physics study circle" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="group-topic">Topic</label>
        <input id="group-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={40} required placeholder="e.g. Physics" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="group-description">What is it for?</label>
        <textarea
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={600}
          rows={3}
          required
          placeholder="Who should join, and what will you study together?"
          className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.saved && <p role="status" className="text-xs font-semibold text-accent">Saved.</p>}
      <button type="submit" disabled={isPending} className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {group ? "Save changes" : "Create group"}
      </button>
    </form>
  );
}

export function DeleteGroupButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Delete this group and every post in it? This can't be undone.")) return;
          setError(null);
          startTransition(async () => {
            try {
              const res = await deleteGroup(groupId);
              if (!res.ok) return setError(res.error);
              router.push("/community/groups");
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className="h-10 text-sm font-bold text-danger hover:underline disabled:opacity-60"
      >
        {isPending ? "Deleting..." : "Delete this group"}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

/** Owner-only: make a member a moderator, or a plain member again. */
export function ModeratorToggle({ groupId, userId, isModerator }: { groupId: string; userId: string; isModerator: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await setGroupModerator(groupId, userId, !isModerator);
              if (!res.ok) return setError(res.error);
              router.refresh();
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className="h-9 rounded-lg px-2 text-xs font-bold text-accent hover:underline disabled:opacity-60"
      >
        {isModerator ? "Remove as moderator" : "Make moderator"}
      </button>
      {error && <span role="alert" className="text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

export function ProfileForm({ initial }: { initial: { bio: string; headline: string; communityPrivate: boolean } }) {
  const router = useRouter();
  const [bio, setBio] = useState(initial.bio);
  const [headline, setHeadline] = useState(initial.headline);
  const [isPrivate, setIsPrivate] = useState(initial.communityPrivate);
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
            const res = await updateCommunityProfile({ bio, headline, communityPrivate: isPrivate });
            setState(res.ok ? { saved: true } : { error: res.error });
            if (res.ok) router.refresh();
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div>
        <label className={LABEL} htmlFor="profile-headline">Headline</label>
        <input id="profile-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} placeholder="e.g. HSC 2027 · loves Physics" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="profile-bio">About you</label>
        <textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What are you studying? What do you want help with?"
          className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          <span className="font-bold">Private profile</span>
          <span className="block text-xs text-muted-foreground">
            Only your followers see your posts, and you won&apos;t be suggested to others. Your name and picture stay visible.
          </span>
        </span>
      </label>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.saved && <p role="status" className="text-xs font-semibold text-accent">Saved.</p>}
      <button type="submit" disabled={isPending} className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save profile
      </button>
    </form>
  );
}

/**
 * Choose your @username. Checks availability as you type and, when the one
 * you want is taken or not allowed, offers the closest free ones to tap.
 */
export function UsernameForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [check, setCheck] = useState<UsernameCheck | null>(current ? { status: "yours", username: current } : null);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<{ error?: string; saved?: string }>({});
  const [isPending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const wanted = value.trim().replace(/^@+/, "");
    if (!wanted) {
      setCheck(null);
      setChecking(false);
      return;
    }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await lookUpUsername(wanted);
        if (mine !== seq.current) return; // a newer keystroke is being checked
        if (res.ok) setCheck(res.check);
        else setState({ error: res.error });
      } catch {
        if (mine === seq.current) setState({ error: NETWORK_ERROR });
      } finally {
        if (mine === seq.current) setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value]);

  const canSave = !checking && check?.status === "available" && !isPending;
  const pick = (u: string) => {
    setState({});
    setValue(u);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        setState({});
        startTransition(async () => {
          try {
            const res = await setUsername(value);
            if (res.ok) {
              setState({ saved: res.username });
              setValue(res.username);
              setCheck({ status: "yours", username: res.username });
              router.refresh();
            } else {
              setState({ error: res.error });
              if ("suggestions" in res && res.suggestions?.length) {
                setCheck({ status: "taken", username: value, message: res.error, suggestions: res.suggestions });
              }
            }
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <label className={LABEL} htmlFor="profile-username">Username</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="profile-username"
            value={value}
            onChange={(e) => {
              setState({});
              setValue(e.target.value.replace(/\s+/g, "").toLowerCase());
            }}
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your.name"
            aria-describedby="username-status"
            className={cn(INPUT, "pl-9")}
          />
        </div>
        <button type="submit" disabled={!canSave} className="comic-btn flex h-11 shrink-0 items-center gap-1.5 bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save
        </button>
      </div>
      <div id="username-status" aria-live="polite" className="min-h-5 text-xs">
        {checking ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Checking...
          </span>
        ) : state.saved ? (
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> You are now @{state.saved}
          </span>
        ) : state.error && !(check && "suggestions" in check) ? (
          <span role="alert" className="font-semibold text-danger">{state.error}</span>
        ) : check?.status === "available" ? (
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> @{check.username} is available
          </span>
        ) : check?.status === "yours" ? (
          <span className="text-muted-foreground">This is your username. People can find you as @{check.username}.</span>
        ) : check && "message" in check ? (
          <span className="font-semibold text-danger">{check.message}</span>
        ) : (
          <span className="text-muted-foreground">Letters, numbers, dots and underscores. 3 to 20 characters.</span>
        )}
      </div>
      {!checking && check && "suggestions" in check && check.suggestions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Available instead:</p>
          <div className="flex flex-wrap gap-1.5">
            {check.suggestions.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => pick(u)}
                className="rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-bold text-foreground hover:bg-accent/15"
              >
                @{u}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

// How often an open chat asks for new messages. No realtime service: the
// chat simply re-reads while it is on screen, and stops when it is not.
const POLL_MS = 8_000;

export function MessageThread({
  conversationId,
  other,
  initial,
  initialHasMore,
}: {
  conversationId: string;
  other: { name: string; avatarUrl: string | null };
  initial: MessageDTO[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [pending, setPending] = useState<{ key: number; body: string; failed?: boolean }[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const lastId = messages[messages.length - 1]?.id;

  // Poll while the tab is visible; pause in the background; stop on unmount.
  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (document.hidden || stopped) return;
      try {
        const res = await pollConversation(conversationId);
        if (stopped || !res.ok) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = res.messages.filter((m) => !known.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        // A missed poll is fine; the next one catches up.
      }
    }
    void tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [conversationId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lastId, pending.length]);

  /** The message shows at once, faded, and becomes a normal bubble when the server has it. */
  function deliver(body: string, key: number) {
    sendMessage(conversationId, body)
      .then((res) => {
        if (!res.ok) {
          setPending((p) => p.map((m) => (m.key === key ? { ...m, failed: true } : m)));
          return setError(res.error);
        }
        setPending((p) => p.filter((m) => m.key !== key));
        setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      })
      .catch(() => {
        setPending((p) => p.map((m) => (m.key === key ? { ...m, failed: true } : m)));
        setError(NETWORK_ERROR);
      });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    const key = ++seq.current;
    setPending((p) => [...p, { key, body }]);
    setText("");
    if (field.current) field.current.style.height = "auto";
    deliver(body, key);
  }

  // Consecutive messages from the same side form one group: joined corners,
  // and the other person's picture only beside the last of theirs.
  const apart = (a?: MessageDTO, b?: MessageDTO) =>
    !a || !b || Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) > 10 * 60_000;
  const rows = messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    return {
      m,
      first: !prev || prev.fromMe !== m.fromMe || apart(prev, m),
      last: !next || next.fromMe !== m.fromMe || apart(m, next),
      stamp: apart(prev, m),
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4" aria-live="polite">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const first = messages[0];
                  if (!first) return;
                  try {
                    const res = await loadOlderMessages(conversationId, `${first.createdAt}_${first.id}`);
                    if (!res.ok) return setError(res.error);
                    setMessages((prev) => [...res.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
                    setHasMore(res.hasMore);
                  } catch {
                    setError(NETWORK_ERROR);
                  }
                })
              }
              className="flex h-9 items-center gap-1.5 rounded-full bg-muted px-4 text-xs font-bold text-foreground"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Show earlier messages
            </button>
          </div>
        )}
        {messages.length === 0 && pending.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <Avatar fallbackClassName="bg-primary/15 text-2xl text-primary" src={other.avatarUrl} name={other.name} size={72} />
            <p className="mt-3 font-display text-lg font-bold text-foreground">{other.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">No messages yet. Say hello.</p>
          </div>
        )}
        {rows.map(({ m, first, last, stamp }) => (
          <div key={m.id} className={first ? "mt-3" : "mt-0.5"}>
            {stamp && <p className="mb-2 text-center text-[11px] font-semibold text-muted-foreground">{formatDhakaTime(m.createdAt)}</p>}
            <div className={cn("flex items-end gap-2", m.fromMe ? "justify-end" : "justify-start")}>
              {!m.fromMe && (
                <span className="w-7 shrink-0">
                  {last && <Avatar fallbackClassName="bg-primary/15 text-[11px] text-primary" src={other.avatarUrl} name={other.name} size={28} />}
                </span>
              )}
              <div
                title={formatDhakaTime(m.createdAt)}
                className={cn(
                  "max-w-[75%] rounded-[1.15rem] px-3.5 py-2",
                  m.fromMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  m.fromMe && !first && "rounded-tr-md",
                  m.fromMe && !last && "rounded-br-md",
                  !m.fromMe && !first && "rounded-tl-md",
                  !m.fromMe && !last && "rounded-bl-md"
                )}
              >
                <RichText text={m.body} className={cn("text-[15px] leading-snug", m.fromMe && "[&_a]:text-primary-foreground")} />
              </div>
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.key} className="mt-0.5 flex flex-col items-end">
            <div className={cn("max-w-[75%] rounded-[1.15rem] bg-primary px-3.5 py-2 text-primary-foreground", p.failed ? "opacity-50" : "opacity-70")}>
              <RichText text={p.body} className="text-[15px] leading-snug" />
            </div>
            <span className="mt-0.5 text-[11px] text-muted-foreground">
              {p.failed ? (
                <button
                  type="button"
                  className="font-bold text-danger hover:underline"
                  onClick={() => {
                    setError(null);
                    setPending((list) => list.map((x) => (x.key === p.key ? { ...x, failed: false } : x)));
                    deliver(p.body, p.key);
                  }}
                >
                  Not sent. Tap to try again
                </button>
              ) : (
                "Sending..."
              )}
            </span>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t border-border/15 p-2.5 sm:p-3">
        {error && <p role="alert" className="mb-2 px-2 text-xs font-semibold text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 rounded-[1.25rem] bg-muted focus-within:ring-2 focus-within:ring-accent/60">
          <textarea
            ref={field}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) send(e);
            }}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={1}
            placeholder="Aa"
            aria-label="Write a message"
            className="field-bare max-h-32 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-4 py-2.5 text-[15px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-transform hover:bg-primary/10 enabled:active:scale-90 disabled:opacity-40"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
