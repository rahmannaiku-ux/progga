"use client";

import { useState, type FormEvent } from "react";
import { Pin, PinOff, Megaphone, WifiOff, Send, Trash2 } from "lucide-react";
import { useLiveChat } from "./use-live-chat";
import type { LiveClassState } from "@/lib/live/state";
import { formatDhakaTimeBST } from "@/lib/timezone";

export type LiveChatModerationHandlers = {
  pinMessage: (messageId: string) => Promise<void>;
  unpinMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  maxPinned: number;
};

/**
 * The chat column of the Live Room. Pinned messages and the
 * announcement render above the scrolling list and are exempt from the
 * 60-second visibility window (enforced in use-live-chat.ts); everything
 * else fades out 60 seconds after it was sent. Built from plain Proggaa
 * primitives -- no Stream stylesheet is ever loaded (see the
 * architecture plan's decision to use core `stream-chat`, not
 * `stream-chat-react`).
 *
 * `moderation`, when passed, renders pin/unpin/delete on each message
 * and switches to the 10-minute teacher visibility window instead of
 * 60s (per the architecture plan). Only /live/manage passes this --
 * the handlers are the actual server actions, which re-run their own
 * assertCanManageLiveClass check, so this prop existing client-side
 * grants nothing by itself.
 */
export function LiveChatPanel({
  liveClassId,
  state,
  moderation,
}: {
  liveClassId: string;
  state: LiveClassState;
  moderation?: LiveChatModerationHandlers;
}) {
  const { status, messages, pinned, announcement, chatEnabled, error, sendMessage } = useLiveChat(
    liveClassId,
    state,
    moderation ? { visibilityWindowMs: 10 * 60_000 } : undefined
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage(text);
      setDraft("");
    } catch {
      /* the input keeps the draft so the sender can retry */
    } finally {
      setSending(false);
    }
  }

  async function handleModerate(action: (id: string) => Promise<void>, messageId: string) {
    setPendingId(messageId);
    try {
      await action(messageId);
    } catch {
      /* the message stays visible; the teacher can retry */
    } finally {
      setPendingId(null);
    }
  }

  if (state !== "LIVE") {
    return (
      <div className="comic-panel flex h-full flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {state === "SCHEDULED" ? "Chat opens when the class goes live." : "Chat has closed."}
        </p>
      </div>
    );
  }

  const pinCapReached = pinned.length >= (moderation?.maxPinned ?? Infinity);

  return (
    <div className="comic-panel flex h-full flex-col bg-surface">
      {(announcement || pinned.length > 0) && (
        <div className="space-y-2 border-b border-border/60 p-3">
          {announcement && (
            <div className="flex items-start gap-2 rounded-lg bg-xp/15 p-2.5 text-xs font-semibold text-foreground">
              <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-xp" />
              <span className="flex-1">{announcement}</span>
            </div>
          )}
          {pinned.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-lg bg-primary/10 p-2.5 text-xs text-foreground">
              <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1">
                <span className="font-semibold">{m.userName}: </span>
                {m.text}
              </span>
              {moderation && (
                <button
                  type="button"
                  aria-label="Unpin"
                  disabled={pendingId === m.id}
                  onClick={() => handleModerate(moderation.unpinMessage, m.id)}
                  className="shrink-0 text-muted-foreground hover:text-danger disabled:opacity-50"
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
        {status === "connecting" && (
          <p className="text-center text-xs text-muted-foreground">Connecting to chat...</p>
        )}
        {status === "error" && <p className="text-center text-xs text-danger">{error ?? "Chat is unavailable."}</p>}
        {status === "offline" && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" /> Reconnecting...
          </p>
        )}
        {messages.length === 0 && status === "connected" && (
          <p className="text-center text-xs text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="group flex items-start justify-between gap-2 text-xs text-foreground">
            <div className="min-w-0">
              <span className="font-semibold">{m.userName}</span>{" "}
              <span suppressHydrationWarning className="text-[10px] text-muted-foreground">
                {formatDhakaTimeBST(new Date(m.createdAtMs))}
              </span>
              <p className="break-words">{m.text}</p>
            </div>
            {moderation && (
              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                {!pinCapReached && (
                  <button
                    type="button"
                    aria-label="Pin"
                    disabled={pendingId === m.id}
                    onClick={() => handleModerate(moderation.pinMessage, m.id)}
                    className="text-muted-foreground hover:text-primary disabled:opacity-50"
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete"
                  disabled={pendingId === m.id}
                  onClick={() => handleModerate(moderation.deleteMessage, m.id)}
                  className="text-muted-foreground hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border/60 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!chatEnabled || status !== "connected"}
          maxLength={300}
          placeholder={chatEnabled ? "Say something..." : "Chat is disabled"}
          className="h-10 flex-1 rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!chatEnabled || status !== "connected" || !draft.trim() || sending}
          aria-label="Send"
          className="comic-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
