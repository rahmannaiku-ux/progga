import type {
  LiveChatModerationTarget,
  LiveChatProvider,
  LiveChatRoomId,
  LiveChatTokenResult,
  LiveChatUserProfile,
} from "./types";

/**
 * In-memory LiveChatProvider for unit/integration tests -- no network,
 * no real tokens. Deliberately reimplements the pieces of Stream's
 * security model that matter for authorization tests (membership-gated
 * "read", ban blocking further access) so authorization tests exercise
 * real behavior, not a rubber stamp. It is NOT a claim about how the
 * real Stream API behaves -- see scripts/stream-acceptance.ts for that.
 */

type Room = {
  exists: boolean;
  members: Set<string>;
  banned: Set<string>;
  frozen: boolean;
  closed: boolean;
  announcement: string | null;
  pinned: Set<string>;
  deletedMessages: Set<string>;
};

export class FakeChatProvider implements LiveChatProvider {
  private rooms = new Map<LiveChatRoomId, Room>();
  private issuedTokens: LiveChatTokenResult[] = [];

  private room(roomId: LiveChatRoomId): Room {
    let r = this.rooms.get(roomId);
    if (!r) {
      r = { exists: false, members: new Set(), banned: new Set(), frozen: false, closed: false, announcement: null, pinned: new Set(), deletedMessages: new Set() };
      this.rooms.set(roomId, r);
    }
    return r;
  }

  async ensureRoom(roomId: LiveChatRoomId): Promise<void> {
    this.room(roomId).exists = true;
  }

  async issueToken(roomId: LiveChatRoomId, profile: LiveChatUserProfile): Promise<LiveChatTokenResult> {
    const room = this.room(roomId);
    room.exists = true;
    if (room.banned.has(profile.id)) throw new Error("User is banned from this room.");
    room.members.add(profile.id);
    const result = { token: `fake-token:${profile.id}:${roomId}`, apiKey: "fake-key", userId: profile.id };
    this.issuedTokens.push(result);
    return result;
  }

  async pinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void> {
    this.room(roomId).pinned.add(messageId);
  }
  async unpinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void> {
    this.room(roomId).pinned.delete(messageId);
  }
  async deleteMessage(messageId: string): Promise<void> {
    for (const room of this.rooms.values()) room.deletedMessages.add(messageId);
  }
  async setAnnouncement(roomId: LiveChatRoomId, text: string | null): Promise<void> {
    this.room(roomId).announcement = text;
  }
  async timeoutUser(target: LiveChatModerationTarget): Promise<void> {
    // A timeout is temporary in the real provider; the fake only needs
    // to prove the call reaches the right room/user for moderation tests.
    this.room(target.roomId).members.delete(target.targetUserId);
  }
  async banUser(target: LiveChatModerationTarget): Promise<void> {
    const room = this.room(target.roomId);
    room.banned.add(target.targetUserId);
    room.members.delete(target.targetUserId);
  }
  async freezeRoom(roomId: LiveChatRoomId, frozen: boolean): Promise<void> {
    this.room(roomId).frozen = frozen;
  }
  async closeRoom(roomId: LiveChatRoomId): Promise<void> {
    const room = this.room(roomId);
    room.frozen = true;
    room.closed = true;
  }
  async deleteRoom(roomId: LiveChatRoomId): Promise<void> {
    this.rooms.delete(roomId);
  }

  // --- test-only introspection, not part of LiveChatProvider ---
  __isMember(roomId: LiveChatRoomId, userId: string): boolean {
    return this.room(roomId).members.has(userId);
  }
  __isBanned(roomId: LiveChatRoomId, userId: string): boolean {
    return this.room(roomId).banned.has(userId);
  }
  __state(roomId: LiveChatRoomId) {
    return this.room(roomId);
  }
  __tokensIssued(): number {
    return this.issuedTokens.length;
  }
}
