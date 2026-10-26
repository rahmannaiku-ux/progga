"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  Bell,
  BellOff,
  Check,
  Crown,
  Info,
  Loader2,
  LogOut,
  MessageCirclePlus,
  Pencil,
  Search,
  Send,
  ThumbsUp,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX_LENGTH, communityTimeAgo } from "@/lib/community/rules";
import { formatDhakaDate, formatDhakaTime } from "@/lib/timezone";
import { loadOlderMessages, pollConversation, sendMessage, setConversationMute } from "@/server/actions/message-actions";
import { MUTE_CHOICES, mutedLabel, type MuteChoice } from "@/lib/community/chat-mute";
import {
  addGroupChatMembers,
  createGroupChat,
  leaveGroupChat,
  loadChats,
  loadOlderGroupMessages,
  pollGroupChat,
  removeGroupChatMember,
  renameGroupChat,
  searchChatPeople,
  sendGroupMessage,
  setGroupChatAdmin,
  setGroupChatMute,
} from "@/server/actions/chat-actions";
import type { ChatSummaryDTO, GroupChatMemberDTO } from "@/server/services/chats";
import type { PersonDTO } from "@/server/services/community";
import { RichText } from "./bits";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
// How often an open chat asks for new messages, and the inbox for new chats.
// No realtime service: screens simply re-read while they are visible.
const THREAD_POLL_MS = 6_000;
const LIST_POLL_MS = 15_000;

type Face = { name: string; avatarUrl: string | null };

/** A chat's picture: the person, or two overlapping faces for a group. */
export function ChatFaces({ kind, faces, size = 56 }: { kind: "direct" | "group"; faces: Face[]; size?: number }) {
  if (kind === "direct" || faces.length < 2) {
    const f = faces[0];
    if (!f && kind === "group") {
      return (
        <span className="flex shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent" style={{ width: size, height: size }}>
          <Users className="h-1/2 w-1/2" aria-hidden="true" />
        </span>
      );
    }
    return <Avatar fallbackClassName="bg-primary/15 text-lg text-primary" src={f?.avatarUrl ?? null} name={f?.name ?? "?"} size={size} />;
  }
  const small = Math.round(size * 0.7);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className="absolute right-0 top-0">
        <Avatar fallbackClassName="bg-accent/20 text-xs text-accent" src={faces[1]!.avatarUrl} name={faces[1]!.name} size={small} />
      </span>
      <span className="absolute bottom-0 left-0 rounded-full ring-2 ring-surface">
        <Avatar fallbackClassName="bg-primary/20 text-xs text-primary" src={faces[0]!.avatarUrl} name={faces[0]!.name} size={small} />
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------

/**
 * The list of chats, Messenger style: search, All / Unread / Groups, and a
 * New group button. Refreshes itself while visible, and marks the open chat.
 */
export function ChatList({ initial, className }: { initial: ChatSummaryDTO[]; className?: string }) {
  const pathname = usePathname() ?? "";
  const [chats, setChats] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const [query, setQuery] = useState("");

  useEffect(() => setChats(initial), [initial]);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (document.hidden || stopped) return;
      try {
        const res = await loadChats();
        if (!stopped && res.ok) setChats(res.chats);
      } catch {
        // The next refresh catches up.
      }
    }
    const timer = setInterval(tick, LIST_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // The open chat is read by now, whatever the last refresh said.
  const shown = chats
    .map((c) => (pathname === c.href ? { ...c, unread: 0 } : c))
    .filter((c) => (filter === "unread" ? c.unread > 0 : filter === "groups" ? c.kind === "group" : true))
    .filter((c) => !query.trim() || c.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section aria-label="Chats" className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Chats</h1>
        <NewGroupChatButton />
      </div>
      <div className="px-3">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="field-bare h-10 w-full rounded-full bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>
        <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["groups", "Groups"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-bold transition-colors",
                filter === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {shown.map((c) => {
          const active = pathname === c.href;
          return (
            <li key={c.key}>
              <Link
                href={c.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active ? "bg-primary/10" : "hover:bg-muted/60"
                )}
              >
                <ChatFaces kind={c.kind} faces={c.faces} size={52} />
                <div className="min-w-0 flex-1">
                  <p className={cn("flex items-center gap-1 text-[15px] text-foreground", c.unread && !c.muted ? "font-extrabold" : "font-semibold")}>
                    <span className="truncate">{c.title}</span>
                    {c.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
                  </p>
                  <p className={cn("flex min-w-0 gap-1 text-[13px]", c.unread && !c.muted ? "font-bold text-foreground" : "text-muted-foreground")}>
                    <span className="truncate">
                      {c.lastMessage
                        ? `${c.lastMessage.fromMe ? "You: " : c.lastMessage.senderName ? `${c.lastMessage.senderName}: ` : ""}${c.lastMessage.body}`
                        : `${c.memberCount} members`}
                    </span>
                    <span className="shrink-0">· {communityTimeAgo(new Date(c.lastActivityAt))}</span>
                  </p>
                </div>
                {c.unread > 0 && (
                  <span
                    className={cn(
                      "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                      // A muted chat still shows how much is new, but quietly.
                      c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                    )}
                  >
                    {c.unread > 9 ? "9+" : c.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            {chats.length === 0 ? (
              <>
                No chats yet. Open someone&apos;s profile and press Message, or start a group.
                <Link href="/community/discover" className="tap-area mt-2 block font-bold text-primary hover:underline">
                  Find heroes
                </Link>
              </>
            ) : filter === "unread" ? (
              "You're all caught up."
            ) : (
              "Nothing matches."
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------
// Picking people (new group, add to group)
// ---------------------------------------------------------------------

function PeoplePicker({ chatId, selected, onChange }: { chatId?: string; selected: PersonDTO[]; onChange: (p: PersonDTO[]) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchChatPeople(query, chatId);
        if (mine !== seq.current) return;
        if (res.ok) {
          setPeople(res.people);
          setError(null);
        } else setError(res.error);
      } catch {
        if (mine === seq.current) setError(NETWORK_ERROR);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, chatId]);

  const isSelected = (id: string) => selected.some((p) => p.id === id);
  const toggle = (p: PersonDTO) => onChange(isSelected(p.id) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);

  return (
    <div>
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Chosen">
          {selected.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className="flex h-8 items-center gap-1.5 rounded-full bg-primary/15 pl-1 pr-2.5 text-xs font-bold text-primary"
                aria-label={`Remove ${p.name}`}
              >
                <Avatar fallbackClassName="bg-primary/20 text-[10px] text-primary" src={p.avatarUrl} name={p.name} size={24} />
                {p.name.split(" ")[0]}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or @username"
          className="field-bare h-10 w-full rounded-full bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
      </label>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => toggle(p)}
              aria-pressed={isSelected(p.id)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/60"
            >
              <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.username ? `@${p.username}` : p.isMentor ? "Mentor" : p.headline ?? "Hero"}
                </span>
              </span>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2",
                  isSelected(p.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"
                )}
              >
                {isSelected(p.id) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
            </button>
          </li>
        ))}
        {!loading && people.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">
            {error ?? "No one to add. You can add people who follow you, people you follow, and mentors."}
          </li>
        )}
        {loading && people.length === 0 && (
          <li className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </li>
        )}
      </ul>
    </div>
  );
}

function NewGroupChatButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<PersonDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-bold text-foreground hover:bg-muted/70"
      >
        <MessageCirclePlus className="h-4 w-4" aria-hidden="true" /> New group
      </button>
      <DialogContent title="New group chat" description="Chat with several people at once." className="max-w-md">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const res = await createGroupChat({ name, memberIds: selected.map((p) => p.id) });
                if (!res.ok) return setError(res.error);
                setOpen(false);
                setName("");
                setSelected([]);
                router.push(`/community/messages/g/${res.chatId}`);
                router.refresh();
              } catch {
                setError(NETWORK_ERROR);
              }
            });
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-foreground">Group name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Physics study squad"
              className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-bold text-foreground">People ({selected.length})</span>
            <PeoplePicker selected={selected} onChange={setSelected} />
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={isPending || !name.trim() || selected.length < 2}
            className="comic-btn flex h-11 w-full items-center justify-center gap-1.5 bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {selected.length < 2 ? "Pick at least two people" : `Create group with ${selected.length} people`}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// A conversation (direct or group)
// ---------------------------------------------------------------------

type ThreadMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  createdAt: string;
  sender?: { id: string; name: string; avatarUrl: string | null } | null;
  isSystem?: boolean;
};

type ThreadProps =
  | {
      kind: "direct";
      id: string;
      other: { id: string; name: string; avatarUrl: string | null; headline: string | null; username: string | null };
      initial: ThreadMessage[];
      initialHasMore: boolean;
      initialOtherReadAt: string;
      initialMutedUntil: string | null;
    }
  | {
      kind: "group";
      id: string;
      meId: string;
      name: string;
      myRole: "ADMIN" | "MEMBER";
      members: GroupChatMemberDTO[];
      initial: ThreadMessage[];
      initialHasMore: boolean;
      initialMutedUntil: string | null;
    };

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s){1,12}$/u;
const isEmojiOnly = (text: string) => EMOJI_ONLY.test(text) && /\p{Extended_Pictographic}/u.test(text) && !/\d/.test(text);

function dayLabel(iso: string): string {
  const day = formatDhakaDate(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
  const today = formatDhakaDate(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
  const yesterday = formatDhakaDate(new Date(Date.now() - 86_400_000), { year: "numeric", month: "2-digit", day: "2-digit" });
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return formatDhakaDate(iso, { weekday: "short", month: "short", day: "numeric" });
}

export function ChatThread(props: ThreadProps) {
  const router = useRouter();
  const { id, kind } = props;
  const [messages, setMessages] = useState<ThreadMessage[]>(props.initial);
  const [pending, setPending] = useState<{ key: number; body: string; failed?: boolean }[]>([]);
  const [hasMore, setHasMore] = useState(props.initialHasMore);
  const [otherReadAt, setOtherReadAt] = useState(props.kind === "direct" ? props.initialOtherReadAt : "");
  const [group, setGroup] = useState(
    props.kind === "group" ? { name: props.name, myRole: props.myRole, members: props.members } : null
  );
  const [gone, setGone] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(props.initialMutedUntil);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const restoreFrom = useRef<number | null>(null);
  const lastId = messages[messages.length - 1]?.id;
  const meId = props.kind === "group" ? props.meId : null;

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      if (kind === "direct") {
        const res = await pollConversation(id);
        if (!res.ok) return;
        setOtherReadAt(res.otherReadAt);
        mergeNew(res.messages);
      } else {
        const res = await pollGroupChat(id);
        if (!res.ok) {
          setGone(true);
          return;
        }
        setGroup({ name: res.name, myRole: res.myRole, members: res.members });
        mergeNew(res.messages);
      }
    } catch {
      // A missed poll is fine; the next one catches up.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  function mergeNew(fresh: ThreadMessage[]) {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const add = fresh.filter((m) => !known.has(m.id));
      return add.length ? [...prev, ...add] : prev;
    });
  }

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, THREAD_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  // Start at the bottom; afterwards follow new messages only while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current; // older messages were added above
      restoreFrom.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (atBottom || last?.fromMe || pending.length) {
      el.scrollTo({ top: el.scrollHeight, behavior: messages.length > props.initial.length ? "smooth" : "auto" });
      setUnseen(0);
    } else {
      setUnseen((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, pending.length]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const before = `${first.createdAt}_${first.id}`;
      const res = kind === "direct" ? await loadOlderMessages(id, before) : await loadOlderGroupMessages(id, before);
      if (!res.ok) return setError(res.error);
      restoreFrom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setMessages((prev) => [...res.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(res.hasMore);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoadingOlder(false);
    }
  }

  /** The message shows at once, faded, and becomes a normal bubble when the server has it. */
  function deliver(body: string, key: number) {
    const send = kind === "direct" ? sendMessage(id, body) : sendGroupMessage(id, body);
    send
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

  function submit(body: string) {
    const clean = body.trim();
    if (!clean) return;
    setError(null);
    const key = ++seq.current;
    setPending((p) => [...p, { key, body: clean }]);
    deliver(clean, key);
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    submit(text);
    setText("");
    if (field.current) {
      field.current.style.height = "auto";
      field.current.focus();
    }
  }

  // Consecutive messages from the same person within ten minutes form one
  // group: joined corners, their name over the first, their face by the last.
  const rows = useMemo(() => {
    const who = (m?: ThreadMessage) => (m ? (m.isSystem ? "system" : m.fromMe ? "me" : m.sender?.id ?? "other") : null);
    const apart = (a?: ThreadMessage, b?: ThreadMessage) =>
      !a || !b || Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) > 10 * 60_000;
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
      return {
        m,
        newDay,
        first: newDay || who(prev) !== who(m) || apart(prev, m),
        last: !next || who(next) !== who(m) || apart(m, next) || dayLabel(next.createdAt) !== dayLabel(m.createdAt),
        stamp: !newDay && apart(prev, m),
      };
    });
  }, [messages]);

  // "Seen": under your last message in a direct chat; faces of who read the latest message in a group.
  const lastMine = [...messages].reverse().find((m) => m.fromMe);
  const lastMessage = messages[messages.length - 1];
  const seenDirect = kind === "direct" && lastMine && lastMine.id === lastMessage?.id && otherReadAt >= lastMine.createdAt;
  const seenBy =
    group && lastMessage
      ? group.members.filter((m) => m.id !== meId && m.id !== lastMessage.sender?.id && m.lastReadAt >= lastMessage.createdAt)
      : [];

  const title = props.kind === "direct" ? props.other.name : group?.name ?? "";
  const headerFaces: Face[] =
    props.kind === "direct"
      ? [{ name: props.other.name, avatarUrl: props.other.avatarUrl }]
      : (group?.members ?? []).filter((m) => m.id !== meId).slice(0, 2);

  if (gone) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Users className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-foreground">You&apos;re no longer in this chat.</p>
        <Link href="/community/messages" className="comic-btn bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          Back to chats
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-border/20 px-2 py-2 sm:px-3">
        <Link
          href="/community/messages"
          aria-label="Back to chats"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted lg:hidden"
        >
          <ArrowDown className="h-5 w-5 rotate-90" aria-hidden="true" />
        </Link>
        <ChatFaces kind={kind} faces={headerFaces} size={40} />
        <div className="min-w-0 flex-1">
          {props.kind === "direct" ? (
            <Link href={`/community/u/${props.other.id}`} className="block truncate text-[15px] font-bold text-foreground hover:underline">
              {title}
            </Link>
          ) : (
            <button type="button" onClick={() => setInfoOpen(true)} className="block max-w-full truncate text-left text-[15px] font-bold text-foreground hover:underline">
              {title}
            </button>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {props.kind === "direct"
              ? props.other.username
                ? `@${props.other.username}${props.other.headline ? ` · ${props.other.headline}` : ""}`
                : props.other.headline ?? "Proggaa hero"
              : `${group?.members.length ?? 0} members`}
          </p>
        </div>
        <MuteMenu
          until={mutedUntil}
          onChoose={async (choice) => {
            const res = kind === "direct" ? await setConversationMute(id, choice) : await setGroupChatMute(id, choice);
            if (!res.ok) return setError(res.error);
            setMutedUntil(res.mutedUntil);
          }}
        />
        {props.kind === "group" ? (
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="Chat details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <Link
            href={`/community/u/${props.other.id}`}
            aria-label="View profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setAtBottom(bottom);
            if (bottom) setUnseen(0);
            if (el.scrollTop < 60 && hasMore && !loadingOlder) void loadOlder();
          }}
          className="h-full overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
          aria-live="polite"
        >
          {hasMore ? (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
                className="flex h-8 items-center gap-1.5 rounded-full bg-muted px-4 text-xs font-bold text-foreground"
              >
                {loadingOlder && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Earlier messages
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center pb-4 pt-6 text-center">
              <ChatFaces kind={kind} faces={headerFaces} size={72} />
              <p className="mt-3 font-display text-lg font-bold text-foreground">{title}</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {props.kind === "direct"
                  ? "Messages here are between the two of you."
                  : `Group chat · ${group?.members.length ?? 0} members. Everyone here sees every message.`}
              </p>
            </div>
          )}

          {rows.map(({ m, newDay, first, last, stamp }) => {
            if (m.isSystem) {
              return (
                <div key={m.id}>
                  {newDay && <DaySeparator iso={m.createdAt} />}
                  <p className="my-2 text-center text-[11px] text-muted-foreground">{m.body}</p>
                </div>
              );
            }
            const emoji = isEmojiOnly(m.body);
            const showName = kind === "group" && !m.fromMe && first;
            const senderFace = kind === "group" ? m.sender : props.kind === "direct" ? props.other : null;
            return (
              <div key={m.id} className={first ? "mt-2.5" : "mt-0.5"}>
                {newDay && <DaySeparator iso={m.createdAt} />}
                {stamp && <p className="mb-2 mt-1 text-center text-[11px] font-semibold text-muted-foreground">{formatDhakaTime(m.createdAt)}</p>}
                {showName && <p className="mb-0.5 ml-11 text-[11px] font-semibold text-muted-foreground">{m.sender?.name ?? "Former member"}</p>}
                <div className={cn("group flex items-end gap-2", m.fromMe ? "justify-end" : "justify-start")}>
                  {!m.fromMe && (
                    <span className="w-8 shrink-0">
                      {last && senderFace && (
                        <Avatar fallbackClassName="bg-primary/15 text-[11px] text-primary" src={senderFace.avatarUrl} name={senderFace.name} size={32} />
                      )}
                    </span>
                  )}
                  <span className="hidden self-center text-[10px] text-muted-foreground group-hover:inline">{m.fromMe && formatDhakaTime(m.createdAt)}</span>
                  <div
                    title={formatDhakaTime(m.createdAt)}
                    className={cn(
                      emoji
                        ? "px-1 text-4xl leading-tight"
                        : cn(
                            "max-w-[78%] rounded-[1.15rem] px-3.5 py-2 sm:max-w-[65%]",
                            m.fromMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                            m.fromMe && !first && "rounded-tr-md",
                            m.fromMe && !last && "rounded-br-md",
                            !m.fromMe && !first && "rounded-tl-md",
                            !m.fromMe && !last && "rounded-bl-md"
                          )
                    )}
                  >
                    {emoji ? m.body : <RichText text={m.body} className={cn("text-[15px] leading-snug", m.fromMe && "[&_a]:text-primary-foreground")} />}
                  </div>
                  <span className="hidden self-center text-[10px] text-muted-foreground group-hover:inline">{!m.fromMe && formatDhakaTime(m.createdAt)}</span>
                </div>
              </div>
            );
          })}

          {pending.map((p) => (
            <div key={p.key} className="mt-0.5 flex flex-col items-end">
              <div
                className={cn(
                  isEmojiOnly(p.body) ? "px-1 text-4xl" : "max-w-[78%] rounded-[1.15rem] bg-primary px-3.5 py-2 text-primary-foreground sm:max-w-[65%]",
                  p.failed ? "opacity-50" : "opacity-70"
                )}
              >
                {isEmojiOnly(p.body) ? p.body : <RichText text={p.body} className="text-[15px] leading-snug" />}
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

          {pending.length === 0 && seenDirect && props.kind === "direct" && (
            <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
              Seen <Avatar fallbackClassName="bg-primary/15 text-[8px] text-primary" src={props.other.avatarUrl} name={props.other.name} size={14} />
            </p>
          )}
          {pending.length === 0 && kind === "direct" && !seenDirect && lastMine && lastMine.id === lastMessage?.id && (
            <p className="mt-1 text-right text-[11px] text-muted-foreground">Sent</p>
          )}
          {pending.length === 0 && seenBy.length > 0 && (
            <div className="mt-1 flex items-center justify-end gap-0.5" aria-label={`Seen by ${seenBy.map((m) => m.name).join(", ")}`}>
              {seenBy.slice(0, 6).map((m) => (
                <span key={m.id} title={m.name}>
                  <Avatar fallbackClassName="bg-primary/15 text-[8px] text-primary" src={m.avatarUrl} name={m.name} size={14} />
                </span>
              ))}
              {seenBy.length > 6 && <span className="ml-0.5 text-[10px] text-muted-foreground">+{seenBy.length - 6}</span>}
            </div>
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}
            className="absolute bottom-3 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold text-primary shadow-card ring-1 ring-border/30"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            {unseen > 0 ? `${unseen} new message${unseen === 1 ? "" : "s"}` : "Latest"}
          </button>
        )}
      </div>

      <form onSubmit={send} className="border-t border-border/15 p-2 sm:p-2.5">
        {error && <p role="alert" className="mb-1.5 px-2 text-xs font-semibold text-danger">{error}</p>}
        <div className="flex items-end gap-1.5">
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
          {text.trim() ? (
            <button
              type="submit"
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-transform hover:bg-primary/10 active:scale-90"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send a thumbs up"
              onClick={() => submit("👍")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-transform hover:bg-primary/10 active:scale-90"
            >
              <ThumbsUp className="h-5 w-5 fill-primary/20" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      {props.kind === "group" && group && (
        <GroupChatInfo
          open={infoOpen}
          onOpenChange={setInfoOpen}
          chatId={id}
          meId={props.meId}
          name={group.name}
          myRole={group.myRole}
          members={group.members}
          onChanged={() => {
            void poll();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** The bell in a chat's header: mute for a while, or turn notifications back on. */
function MuteMenu({ until, onChoose }: { until: string | null; onChoose: (choice: MuteChoice) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = mutedLabel(
    until,
    (d) => formatDhakaTime(d.toISOString()),
    (d) => formatDhakaDate(d.toISOString(), { day: "numeric", month: "short" })
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function choose(choice: MuteChoice) {
    setBusy(true);
    try {
      await onChoose(choice);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ? `${label}. Change` : "Mute notifications"}
        title={label ?? "Mute notifications"}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted",
          label ? "text-muted-foreground" : "text-primary"
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : label ? <BellOff className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-border/30 bg-surface p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label ?? "Mute notifications"}
          </p>
          {label ? (
            <button type="button" role="menuitem" disabled={busy} onClick={() => choose("off")} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted">
              <Bell className="h-4 w-4" aria-hidden="true" /> Unmute
            </button>
          ) : (
            MUTE_CHOICES.map((c) => (
              <button key={c.value} type="button" role="menuitem" disabled={busy} onClick={() => choose(c.value)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted">
                <BellOff className="h-4 w-4" aria-hidden="true" /> {c.label}
              </button>
            ))
          )}
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-muted-foreground">You still get the messages, without notifications.</p>
        </div>
      )}
    </div>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border/20" />
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{dayLabel(iso)}</span>
      <span className="h-px flex-1 bg-border/20" />
    </div>
  );
}

// ---------------------------------------------------------------------
// Group chat details: members, adding, admins, rename, leave
// ---------------------------------------------------------------------

function GroupChatInfo({
  open,
  onOpenChange,
  chatId,
  meId,
  name,
  myRole,
  members,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chatId: string;
  meId: string;
  name: string;
  myRole: "ADMIN" | "MEMBER";
  members: GroupChatMemberDTO[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<"members" | "add" | "rename">("members");
  const [newName, setNewName] = useState(name);
  const [toAdd, setToAdd] = useState<PersonDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = myRole === "ADMIN";

  useEffect(() => {
    if (!open) {
      setView("members");
      setToAdd([]);
      setError(null);
    }
    setNewName(name);
  }, [open, name]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) return setError(res.error);
        after?.();
        onChanged();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={view === "add" ? "Add people" : view === "rename" ? "Rename group" : name} description={`${members.length} members`} className="max-w-md">
        {view === "members" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setView("add")}
                className="flex flex-col items-center gap-1 rounded-xl bg-muted p-2.5 text-xs font-bold text-foreground hover:bg-muted/70"
              >
                <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" /> Add
              </button>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => setView("rename")}
                className="flex flex-col items-center gap-1 rounded-xl bg-muted p-2.5 text-xs font-bold text-foreground hover:bg-muted/70 disabled:opacity-40"
                title={isAdmin ? undefined : "Only admins can rename the group"}
              >
                <Pencil className="h-5 w-5 text-primary" aria-hidden="true" /> Rename
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm("Leave this group chat? You'll stop getting its messages.")) return;
                  run(
                    () => leaveGroupChat(chatId),
                    () => {
                      onOpenChange(false);
                      router.push("/community/messages");
                    }
                  );
                }}
                className="flex flex-col items-center gap-1 rounded-xl bg-muted p-2.5 text-xs font-bold text-danger hover:bg-danger/10"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" /> Leave
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/50">
                  <Link href={`/community/u/${m.id}`} className="shrink-0">
                    <Avatar fallbackClassName="bg-primary/15 text-primary" src={m.avatarUrl} name={m.name} size={40} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/community/u/${m.id}`} className="tap-pad block truncate text-sm font-bold text-foreground hover:underline">
                      {m.name}
                      {m.id === meId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </Link>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {m.role === "ADMIN" && <Crown className="h-3 w-3 text-xp" aria-hidden="true" />}
                      {m.role === "ADMIN" ? "Admin" : m.username ? `@${m.username}` : "Member"}
                    </p>
                  </div>
                  {isAdmin && m.id !== meId && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => setGroupChatAdmin(chatId, m.id, m.role !== "ADMIN"))}
                        className="h-8 rounded-lg px-2 text-[11px] font-bold text-accent hover:bg-accent/10"
                      >
                        {m.role === "ADMIN" ? "Remove admin" : "Make admin"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        aria-label={`Remove ${m.name}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.name} from the group?`)) run(() => removeGroupChatMember(chatId, m.id));
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger hover:bg-danger/10"
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === "add" && (
          <div className="space-y-3">
            <PeoplePicker chatId={chatId} selected={toAdd} onChange={setToAdd} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setView("members")} className="h-11 flex-1 rounded-xl bg-muted text-sm font-bold text-foreground">
                Back
              </button>
              <button
                type="button"
                disabled={isPending || toAdd.length === 0}
                onClick={() =>
                  run(
                    () => addGroupChatMembers(chatId, toAdd.map((p) => p.id)),
                    () => {
                      setToAdd([]);
                      setView("members");
                    }
                  )
                }
                className="comic-btn flex h-11 flex-1 items-center justify-center gap-1.5 bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Add {toAdd.length || ""}
              </button>
            </div>
          </div>
        )}

        {view === "rename" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameGroupChat(chatId, newName), () => setView("members"));
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              autoFocus
              aria-label="Group name"
              className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setView("members")} className="h-11 flex-1 rounded-xl bg-muted text-sm font-bold text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !newName.trim()}
                className="comic-btn flex h-11 flex-1 items-center justify-center gap-1.5 bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save
              </button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
