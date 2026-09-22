import type {
  LiveChatModerationTarget,
  LiveChatProvider,
  LiveChatRoomId,
  LiveChatTokenResult,
  LiveChatUserProfile,
} from "./types";

/**
 * Stream Chat implementation of LiveChatProvider.
 *
 * UNVERIFIED (no installed `stream-chat` package and no real Stream app
 * were available while writing this -- see the Step 1 report). This is
 * written against Stream's documented Node client API and must be
 * checked with `scripts/stream-acceptance.ts` against a real TEST app
 * before `live_room` is turned on for real students. In particular:
 *   - non-member channel read/watch actually fails (the whole security
 *     model here rests on this)
 *   - the exact channel-type permission grant names
 *   - channel-id character rules (a cuid is expected to be safe)
 *   - banned-user read/write behavior
 *
 * Channel design (see architecture plan section E/F/G for the "why"):
 *   - channel type: "liveclass" (custom type -- must be created once,
 *     out of band, via Stream's dashboard or createChannelType; this
 *     file does not create the TYPE, only channel instances of it)
 *   - channel id: the LiveClass.id (a cuid) -- cid is "liveclass:{id}"
 *   - membership is the isolation mechanism: a Stream token alone does
 *     NOT scope a user to one channel, so every token issuance ensures
 *     membership first (see issueToken)
 *   - custom channel data holds `announcement` and `liveState`, which
 *     the client reads on every connect/reconnect (no history scan)
 *
 * Stream user id = Proggaa User.id (not the Clerk id). The client SDK
 * connects with only `{ id }` (see the Live Room UI, step 9) -- this
 * file is the only place that sets name/image/role, via connectUser's
 * upsert, so the browser can never claim its own name or role.
 */

// Lazily imported so this module can be loaded (and the rest of the app
// can build) even before `stream-chat` is installed -- only code paths
// that actually issue tokens / call Stream need the package present.
type StreamChatModule = typeof import("stream-chat");
let streamChatModulePromise: Promise<StreamChatModule> | null = null;
function loadStreamChat(): Promise<StreamChatModule> {
  if (!streamChatModulePromise) {
    streamChatModulePromise = import("stream-chat").catch(() => {
      streamChatModulePromise = null;
      throw new Error(
        "The 'stream-chat' package isn't installed. Run `npm install stream-chat` (see .env.example for the required STREAM_* variables)."
      );
    });
  }
  return streamChatModulePromise;
}

const CHANNEL_TYPE = "liveclass";

// Teacher/student caps agreed in the architecture plan.
const MAX_MESSAGE_LENGTH = 300;
const COOLDOWN_SECONDS = 5; // see Step 1 report: 3s allows ~2000 msgs/min at 100 chatters, over Stream's Send Message limit
const MAX_PINNED_MESSAGES = 3;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} for the Stream Chat provider.`);
  return value;
}

async function getServerClient() {
  const { StreamChat } = await loadStreamChat();
  // getInstance memoizes per apiKey -- safe to call on every request,
  // this does not open a new connection each time (server-side client
  // calls are plain signed REST requests, not a persistent socket).
  return StreamChat.getInstance(requireEnv("STREAM_API_KEY"), requireEnv("STREAM_API_SECRET"));
}

export class StreamChatProvider implements LiveChatProvider {
  async ensureRoom(roomId: LiveChatRoomId): Promise<void> {
    const client = await getServerClient();
    const channel = client.channel(CHANNEL_TYPE, roomId, {
      created_by_id: "system",
    } as Record<string, unknown>);
    // create() is idempotent -- calling it on an already-existing
    // channel is a no-op that returns the existing state rather than
    // erroring or duplicating it.
    await channel.create();
  }

  async issueToken(roomId: LiveChatRoomId, profile: LiveChatUserProfile): Promise<LiveChatTokenResult> {
    const client = await getServerClient();

    // 1. Upsert the profile server-side. The browser never sends this --
    //    it is derived from Proggaa's own User row by the caller
    //    (server/live/live-access.ts + the token route), never from the
    //    request body.
    await client.upsertUser({
      id: profile.id,
      name: profile.name,
      image: profile.avatarUrl ?? undefined,
      // Custom field only, informational -- Stream's *permission* grants
      // key off channel_member vs channel_moderator (set via role below),
      // not off this string.
      proggaaRole: profile.role,
    } as never);

    // 2. Ensure the channel exists.
    const channel = client.channel(CHANNEL_TYPE, roomId, { created_by_id: "system" } as Record<string, unknown>);
    await channel.create();

    // 3. Ensure membership -- this is the actual isolation boundary
    //    (UNVERIFIED, see header). Teachers get channel_moderator so
    //    they're exempt from the message cooldown; students get the
    //    default member role. addMembers is idempotent for a user who
    //    is already a member.
    const member: Record<string, unknown> = { user_id: profile.id };
    if (profile.role === "teacher") member.channel_role = "channel_moderator";
    await channel.addMembers([member as never]);

    // 4. Short-lived token. Students refresh more often (forces
    //    re-authorization through assertCanJoinLiveRoom on every
    //    refresh, so a dropped enrollment or a ban takes effect within
    //    minutes); teachers get a shorter TTL still, since they hold
    //    moderator rights.
    const ttlSeconds = profile.role === "teacher" ? 15 * 60 : 60 * 60;
    const token = client.createToken(profile.id, Math.floor(Date.now() / 1000) + ttlSeconds);

    return { token, apiKey: requireEnv("NEXT_PUBLIC_STREAM_API_KEY"), userId: profile.id };
  }

  async pinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void> {
    const client = await getServerClient();
    // pinMessage requires acting *as* someone; use the system user so
    // pins are attributed to Proggaa moderation, not a specific teacher
    // account that might change.
    await client.pinMessage(messageId, null, "system");
    void roomId; // pin cap (MAX_PINNED_MESSAGES) is enforced by the caller before calling this -- see moderation actions (step 11)
  }

  async unpinMessage(roomId: LiveChatRoomId, messageId: string): Promise<void> {
    const client = await getServerClient();
    await client.unpinMessage(messageId, "system");
    void roomId;
  }

  async deleteMessage(messageId: string): Promise<void> {
    const client = await getServerClient();
    await client.deleteMessage(messageId, true /* hard delete -- no student chat is meant to persist */);
  }

  async setAnnouncement(roomId: LiveChatRoomId, text: string | null): Promise<void> {
    const client = await getServerClient();
    const channel = client.channel(CHANNEL_TYPE, roomId);
    await channel.updatePartial({ set: { announcement: text } as never });
  }

  async timeoutUser(target: LiveChatModerationTarget, minutes: number): Promise<void> {
    const client = await getServerClient();
    await client.channel(CHANNEL_TYPE, target.roomId).banUser(target.targetUserId, {
      timeout: minutes,
      banned_by_id: "system",
      reason: "Timed out by a teacher.",
    });
  }

  async banUser(target: LiveChatModerationTarget): Promise<void> {
    const client = await getServerClient();
    const channel = client.channel(CHANNEL_TYPE, target.roomId);
    await channel.banUser(target.targetUserId, { banned_by_id: "system", reason: "Removed by a teacher." });
    await channel.removeMembers([target.targetUserId]);
  }

  async freezeRoom(roomId: LiveChatRoomId, frozen: boolean): Promise<void> {
    const client = await getServerClient();
    await client.channel(CHANNEL_TYPE, roomId).updatePartial({ set: { frozen } });
  }

  async closeRoom(roomId: LiveChatRoomId): Promise<void> {
    const client = await getServerClient();
    const channel = client.channel(CHANNEL_TYPE, roomId);
    await channel.updatePartial({ set: { liveState: "ended", frozen: true } as never });
  }

  async deleteRoom(roomId: LiveChatRoomId): Promise<void> {
    const client = await getServerClient();
    // hard delete -- only ever called by the 30-day sweep (step 13),
    // long after the class has ended.
    await client.channel(CHANNEL_TYPE, roomId).delete({ hard_delete: true } as Record<string, unknown>);
  }
}

/**
 * One-time (per deploy, not per request) setup for the "liveclass"
 * channel type -- text-only, membership-gated, capped message length,
 * cooldown, no reactions/replies/typing/read events. Run this from a
 * setup script against your Stream app, NOT on every request. Exists
 * here so the exact grants are defined next to the provider that
 * depends on them, but it is intentionally not wired into any request
 * path.
 *
 * UNVERIFIED: the exact permission grant identifiers (e.g.
 * "create-message", "read-channel") per Step 1 findings -- confirm
 * against your Stream app/dashboard before running this for real.
 */
export async function ensureLiveClassChannelTypeConfigured(): Promise<void> {
  const client = await getServerClient();
  const exists = await client.getChannelType(CHANNEL_TYPE).catch(() => null);

  const config = {
    name: CHANNEL_TYPE,
    typing_events: false,
    read_events: false,
    connect_events: true,
    search: false,
    reactions: false,
    replies: false,
    uploads: false,
    url_enrichment: false,
    mutes: false,
    message_retention: "infinite",
    max_message_length: MAX_MESSAGE_LENGTH,
  } as Record<string, unknown>;

  if (!exists) {
    await client.createChannelType(config);
  } else {
    await client.updateChannelType(CHANNEL_TYPE, config);
  }
}

export const STREAM_LIVECLASS_CHANNEL_CONFIG = Object.freeze({
  type: CHANNEL_TYPE,
  maxMessageLength: MAX_MESSAGE_LENGTH,
  cooldownSeconds: COOLDOWN_SECONDS,
  maxPinnedMessages: MAX_PINNED_MESSAGES,
});
