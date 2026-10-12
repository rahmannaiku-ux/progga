"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX_LENGTH } from "@/lib/community/rules";
import { formatDhakaTime } from "@/lib/timezone";
import {
  createGroup,
  deleteGroup,
  setGroupModerator,
  updateCommunityProfile,
  updateGroup,
} from "@/server/actions/community-actions";
import { loadOlderMessages, pollConversation, sendMessage } from "@/server/actions/message-actions";
import type { MessageDTO } from "@/server/services/community";
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

// How often an open chat asks for new messages. No realtime service: the
// chat simply re-reads while it is on screen, and stops when it is not.
const POLL_MS = 8_000;

export function MessageThread({
  conversationId,
  initial,
  initialHasMore,
}: {
  conversationId: string;
  initial: MessageDTO[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
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
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendMessage(conversationId, body);
        if (!res.ok) return setError(res.error);
        setText("");
        setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4" aria-live="polite">
        {hasMore && (
          <div className="flex justify-center">
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
              className="h-9 rounded-full bg-muted px-4 text-xs font-bold text-foreground"
            >
              Show earlier messages
            </button>
          </div>
        )}
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[82%] rounded-2xl px-3.5 py-2", m.fromMe ? "bg-accent text-accent-foreground" : "bg-muted text-foreground")}>
              <RichText text={m.body} className={cn("text-sm leading-relaxed", m.fromMe && "[&_a]:text-accent-foreground")} />
              <time dateTime={m.createdAt} className={cn("mt-0.5 block text-right text-[10px]", m.fromMe ? "text-accent-foreground/75" : "text-muted-foreground")}>
                {formatDhakaTime(m.createdAt)}
              </time>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t border-border/20 p-3">
        {error && <p role="alert" className="mb-2 text-xs font-semibold text-danger">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={1}
            placeholder="Write a message..."
            aria-label="Write a message"
            className="max-h-32 min-h-[44px] min-w-0 flex-1 rounded-2xl border border-border/60 bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" disabled={isPending || !text.trim()} aria-label="Send" className="comic-btn flex h-11 w-11 shrink-0 items-center justify-center bg-accent text-accent-foreground disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </form>
    </div>
  );
}
