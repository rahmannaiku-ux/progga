import { FakeChatProvider } from "./fake-provider";
import { StreamChatProvider } from "./stream-provider";
import type { LiveChatProvider } from "./types";

/**
 * The one place the rest of the app imports a chat provider from.
 * Nothing outside server/live/chat/** should import FakeChatProvider or
 * StreamChatProvider directly -- that's what keeps a future provider
 * swap to "write one new class + change this file."
 *
 * Selection: `LIVE_CHAT_PROVIDER=fake` (tests / local dev without Stream
 * credentials) forces the in-memory fake; anything else uses Stream.
 * `LiveClass.chatProvider` (persisted, currently always "stream") is
 * where a future per-room override would be read from, but nothing
 * reads it yet since there is only one real provider.
 */
let cached: LiveChatProvider | null = null;

export function getLiveChatService(): LiveChatProvider {
  if (cached) return cached;
  cached = process.env.LIVE_CHAT_PROVIDER === "fake" ? new FakeChatProvider() : new StreamChatProvider();
  return cached;
}

/** Test-only: replace the cached provider (e.g. with a fresh FakeChatProvider per test) and reset it after. */
export function __setLiveChatServiceForTest(provider: LiveChatProvider | null): void {
  cached = provider;
}

export type { LiveChatProvider, LiveChatUserProfile, LiveChatTokenResult, LiveChatModerationTarget, LiveChatRoomId } from "./types";
export { STREAM_LIVECLASS_CHANNEL_CONFIG } from "./stream-provider";
