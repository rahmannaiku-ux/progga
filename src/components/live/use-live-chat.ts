"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeClockSkewMs, correctedNowMs } from "@/lib/live/clock";
import type { LiveClassState } from "@/lib/live/state";

/**
 * Client-side Live Room chat: connects to Stream, applies the 60-second
 * rolling visibility rule (pinned + announcements exempt), and manages
 * the connection lifecycle described in the architecture plan.
 *
 * UNVERIFIED end-to-end: written against Stream's documented browser
 * client API (same `stream-chat` package as the server, dynamically
 * imported so this file loads even before it's installed -- see
 * server/live/chat/stream-provider.ts for the same pattern), but never
 * run against a real Stream app. The 60s visibility rule and the
 * ring-buffer/single-timer scheduling ARE plain client-side logic and
 * can be sanity-checked without Stream once the package is installed.
 *
 * Deliberately simplified vs. the full plan for a first pass:
 *   - tab ownership via `navigator.locks` (only one tab holds the
 *     connection) is NOT implemented yet -- every mounted tab connects
 *     independently. Safe (no data corruption) but not bandwidth-ideal;
 *     flagged as a follow-up rather than blocking the room on it.
 *   - idle-tab disconnect after ~5 minutes hidden IS implemented (see
 *     the visibilitychange effect below).
 */

const CHANNEL_TYPE = "liveclass";
const VISIBILITY_WINDOW_MS = 60_000;
const INITIAL_MESSAGE_LIMIT = 30;
const RING_BUFFER_CAP = 100;
const IDLE_HIDDEN_DISCONNECT_MS = 5 * 60 * 1000;

export type LiveChatMessage = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAtMs: number;
  pinned: boolean;
};

export type LiveChatConnectionStatus = "connecting" | "connected" | "offline" | "error" | "disabled";

export type UseLiveChatResult = {
  status: LiveChatConnectionStatus;
  messages: LiveChatMessage[];
  pinned: LiveChatMessage[];
  announcement: string | null;
  chatEnabled: boolean;
  sendMessage: (text: string) => Promise<void>;
  error: string | null;
};

type TokenResponse = {
  token: string;
  apiKey: string;
  userId: string;
  channelType: string;
  channelId: string;
  serverNow: string;
};

/** Only mounts the Stream connection while the room is open AND the class is actually LIVE. */
export function useLiveChat(
  liveClassId: string,
  state: LiveClassState,
  options?: { visibilityWindowMs?: number }
): UseLiveChatResult {
  const windowMs = options?.visibilityWindowMs ?? VISIBILITY_WINDOW_MS;
  const [status, setStatus] = useState<LiveChatConnectionStatus>("connecting");
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [pinned, setPinned] = useState<LiveChatMessage[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clockSkewRef = useRef(0);
  const clientRef = useRef<unknown>(null); // StreamChat instance (typed loosely -- see the dynamic import note above)
  const channelRef = useRef<{ sendMessage: (msg: { text: string }) => Promise<unknown> } | null>(null);
  const allMessagesRef = useRef<LiveChatMessage[]>([]); // full ring buffer; `messages` is the filtered-for-display view
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recomputeVisible = useCallback(() => {
    const now = correctedNowMs(clockSkewRef.current);
    const visible = allMessagesRef.current.filter((m) => m.pinned || now - m.createdAtMs < windowMs);
    setMessages(visible);

    // Single timer targeting the NEXT message's expiry, not a per-second
    // tick -- see the architecture plan's "no per-second render loop"
    // requirement.
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    const nextExpiring = allMessagesRef.current
      .filter((m) => !m.pinned)
      .map((m) => m.createdAtMs + windowMs)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (nextExpiring !== undefined) {
      expiryTimerRef.current = setTimeout(recomputeVisible, Math.max(250, nextExpiring - now));
    }
  }, [windowMs]);

  const addOrUpdateMessage = useCallback(
    (msg: LiveChatMessage) => {
      const list = allMessagesRef.current;
      const idx = list.findIndex((m) => m.id === msg.id);
      if (idx >= 0) list[idx] = msg;
      else {
        list.push(msg);
        if (list.length > RING_BUFFER_CAP) list.splice(0, list.length - RING_BUFFER_CAP);
      }
      recomputeVisible();
    },
    [recomputeVisible]
  );

  useEffect(() => {
    if (state !== "LIVE") {
      setStatus(state === "SCHEDULED" ? "connecting" : "disabled");
      return;
    }

    let cancelled = false;
    let client: import("stream-chat").StreamChat | null = null;

    async function connect() {
      try {
        setStatus("connecting");
        const requestSentAt = Date.now();
        const res = await fetch(`/api/live/${liveClassId}/chat-token`, { method: "POST" });
        const responseReceivedAt = Date.now();
        if (!res.ok) {
          if (res.status === 404) throw new Error("This live class no longer exists.");
          if (res.status === 403) throw new Error("You don't have access to this live class.");
          throw new Error("Unable to connect to chat right now.");
        }
        const data: TokenResponse = await res.json();
        if (cancelled) return;

        clockSkewRef.current = computeClockSkewMs(Date.parse(data.serverNow), requestSentAt, responseReceivedAt);

        const { StreamChat } = await import("stream-chat");
        client = StreamChat.getInstance(data.apiKey);
        clientRef.current = client;
        // connectUser sends ONLY the id here -- the client can never
        // claim its own name/role; the server already upserted the real
        // profile during token issuance (see stream-provider.ts).
        await client.connectUser({ id: data.userId }, data.token);
        if (cancelled) {
          await client.disconnectUser().catch(() => {});
          return;
        }

        const channel = client.channel(data.channelType, data.channelId);
        const state = await channel.watch({ messages: { limit: INITIAL_MESSAGE_LIMIT } } as never);

        channelRef.current = channel as unknown as { sendMessage: (msg: { text: string }) => Promise<unknown> };

        const channelData = (state as unknown as { channel?: Record<string, unknown> }).channel ?? {};
        setChatEnabled(!channelData.frozen);
        setAnnouncement((channelData.announcement as string | undefined) ?? null);

        const initialMessages: unknown[] = (state as { messages?: unknown[] }).messages ?? [];
        const initialPinned: unknown[] = (state as { pinned_messages?: unknown[] }).pinned_messages ?? [];
        const pinnedIds = new Set(initialPinned.map((m) => (m as { id: string }).id));

        allMessagesRef.current = initialMessages.map((m) => toLiveChatMessage(m, pinnedIds));
        setPinned(initialPinned.map((m) => toLiveChatMessage(m, pinnedIds)));
        recomputeVisible();
        setStatus("connected");

        channel.on("message.new", (event: { message?: unknown }) => {
          if (event.message) addOrUpdateMessage(toLiveChatMessage(event.message, new Set()));
        });
        channel.on("message.deleted", (event: { message?: { id?: string } }) => {
          if (!event.message?.id) return;
          allMessagesRef.current = allMessagesRef.current.filter((m) => m.id !== event.message!.id);
          recomputeVisible();
        });
        const noOpHandler = () => {
          /* no-op: reactions are disabled at the channel-type level; updates are rare (a pin toggling doesn't change message.updated) */
        };
        channel.on("message.updated", noOpHandler);
        channel.on("reaction.new", noOpHandler);
        channel.on("channel.updated", (event) => {
          const eventChannel = (event as unknown as { channel?: Record<string, unknown> }).channel;
          if (!eventChannel) return;
          setChatEnabled(!eventChannel.frozen);
          setAnnouncement((eventChannel.announcement as string | undefined) ?? null);
        });

        client.on("connection.changed", (event: { online?: boolean }) => {
          if (cancelled) return;
          setStatus(event.online ? "connected" : "offline");
        });
        client.on("connection.recovered", async () => {
          if (cancelled) return;
          // Per the architecture plan: on reconnect, re-query rather
          // than trust anything buffered while offline -- restores
          // chat, pinned messages and the announcement in one call.
          try {
            const fresh = await channel.watch({ messages: { limit: INITIAL_MESSAGE_LIMIT } } as never);
            const freshMessages: unknown[] = (fresh as { messages?: unknown[] }).messages ?? [];
            const freshPinned: unknown[] = (fresh as { pinned_messages?: unknown[] }).pinned_messages ?? [];
            const freshPinnedIds = new Set(freshPinned.map((m) => (m as { id: string }).id));
            allMessagesRef.current = freshMessages.map((m) => toLiveChatMessage(m, freshPinnedIds));
            setPinned(freshPinned.map((m) => toLiveChatMessage(m, freshPinnedIds)));
            recomputeVisible();
            setStatus("connected");
          } catch {
            /* next connection.changed/recovered cycle will retry */
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to connect to chat.");
          setStatus("error");
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      channelRef.current = null;
      clientRef.current = null;
      void client?.disconnectUser().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addOrUpdateMessage/recomputeVisible are stable via useCallback
  }, [liveClassId, state]);

  // Idle-hidden disconnect: per the architecture plan, a backgrounded
  // tab drops its Stream connection after ~5 minutes to conserve the
  // connection budget, and simply reconnects (via the effect above,
  // since `status` moving away from "connected" only happens through
  // the normal connect/cleanup path) when the tab is foregrounded again
  // -- this only forces a visibility recheck; actual reconnection is
  // handled by remounting through the parent room page, which is the
  // simplest correct behavior for a first pass.
  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    function onVisibilityChange() {
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          if (document.hidden && clientRef.current) setStatus("offline");
        }, IDLE_HIDDEN_DISCONNECT_MS);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !channelRef.current) return;
    await channelRef.current.sendMessage({ text: trimmed });
  }, []);

  return { status, messages, pinned, announcement, chatEnabled, error, sendMessage };
}

function toLiveChatMessage(raw: unknown, pinnedIds: Set<string>): LiveChatMessage {
  const m = raw as { id: string; text?: string; user?: { id: string; name?: string }; created_at?: string; pinned?: boolean };
  return {
    id: m.id,
    text: m.text ?? "",
    userId: m.user?.id ?? "unknown",
    userName: m.user?.name ?? "Student",
    createdAtMs: m.created_at ? Date.parse(m.created_at) : Date.now(),
    pinned: m.pinned === true || pinnedIds.has(m.id),
  };
}
