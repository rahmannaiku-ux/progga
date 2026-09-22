/**
 * Provider-agnostic contract for Live Room realtime chat. The rest of
 * the app (token route, moderation actions, lifecycle actions) depends
 * only on `LiveChatService` (service.ts), which delegates to whichever
 * `LiveChatProvider` is configured -- today that's `StreamChatProvider`
 * (stream-provider.ts), backed by `FakeChatProvider` (fake-provider.ts)
 * in tests. Swapping realtime vendors later means writing one new class
 * against this interface, not touching call sites.
 *
 * Every method here is a SERVER-side operation (it may use the vendor's
 * secret key). There is no client-side surface in this file -- the
 * browser only ever receives a short-lived token and talks to the
 * vendor's SDK directly (see the Live Room UI, step 9).
 */

export type LiveChatRoomId = string; // == LiveClass.id

export type LiveChatUserProfile = {
  id: string; // Proggaa User.id
  name: string;
  avatarUrl: string | null;
  /** "teacher" gets elevated (moderator) rights in the room; "student" does not. */
  role: "teacher" | "student";
};

export type LiveChatTokenResult = {
  token: string;
  apiKey: string;
  userId: string;
};

export type LiveChatModerationTarget = {
  roomId: LiveChatRoomId;
  targetUserId: string;
};

export interface LiveChatProvider {
  /** Idempotent: creates the room's channel if it doesn't exist yet, and applies current chatEnabled/state. Never creates a duplicate. */
  ensureRoom(roomId: LiveChatRoomId): Promise<void>;

  /**
   * Idempotently upserts the caller's profile, ensures the room exists
   * and that the caller is a member (required for read/send under the
   * `liveclass` channel type -- see server/live/chat/stream-provider.ts
   * header comment), then issues a short-lived token. The client MUST
   * NOT be able to set its own name/role/permissions -- those come only
   * from `profile`, which the caller derives server-side (never from
   * request body).
   */
  issueToken(roomId: LiveChatRoomId, profile: LiveChatUserProfile): Promise<LiveChatTokenResult>;

  pinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void>;
  unpinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;

  /** Stored as channel custom data; exempt from the 60s client-side visibility window. Pass null to clear it. */
  setAnnouncement(roomId: LiveChatRoomId, text: string | null): Promise<void>;

  /** Timed channel-scoped ban -- "mute". */
  timeoutUser(target: LiveChatModerationTarget, minutes: number): Promise<void>;
  /** Permanent channel-scoped ban + membership removal -- "remove". */
  banUser(target: LiveChatModerationTarget): Promise<void>;

  /** Freezes/unfreezes the channel (chat disabled/enabled). */
  freezeRoom(roomId: LiveChatRoomId, frozen: boolean): Promise<void>;

  /** Marks the room ended (`liveState: "ended"`) and freezes it. Does not delete anything -- see closeRoom. */
  closeRoom(roomId: LiveChatRoomId): Promise<void>;

  /** Permanently deletes the channel. Only called by the sweep, well after a class ends (see step 13). */
  deleteRoom(roomId: LiveChatRoomId): Promise<void>;
}
