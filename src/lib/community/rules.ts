import { z } from "zod";

// ---------------------------------------------------------------------
// Proggaa Community — pure rules (no DB, no React), shared by the server
// actions, the queries and the UI, and covered by rules.test.ts.
// ---------------------------------------------------------------------

export const POST_MAX_LENGTH = 5000;
export const COMMENT_MAX_LENGTH = 2000;
export const MESSAGE_MAX_LENGTH = 2000;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const FEED_PAGE_SIZE = 10;
export const COMMENTS_PAGE_SIZE = 30;
export const MESSAGES_PAGE_SIZE = 30;

export const REACTION_TYPES = ["LIKE", "LOVE", "CELEBRATE", "INSIGHTFUL", "CURIOUS"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_META: Record<ReactionType, { emoji: string; label: string }> = {
  LIKE: { emoji: "👍", label: "Like" },
  LOVE: { emoji: "❤️", label: "Love" },
  CELEBRATE: { emoji: "🎉", label: "Celebrate" },
  INSIGHTFUL: { emoji: "💡", label: "Insightful" },
  CURIOUS: { emoji: "🤔", label: "Curious" },
};

export const REPORT_REASONS = [
  "Spam or advertising",
  "Harassment or bullying",
  "Hate or abusive language",
  "Cheating or leaked exam answers",
  "Inappropriate content",
  "Something else",
] as const;

/**
 * Shape check for a post's picture: a file this site stored (Google Drive,
 * served from /api/files) or its UploadThing fallback. The server action
 * additionally requires a matching Upload row owned by the poster, so an
 * arbitrary outside URL can never be attached.
 */
export function isCommunityImageUrl(value: string): boolean {
  return (
    /^\/api\/files\/[A-Za-z0-9_-]{6,64}$/.test(value) ||
    /^https:\/\/utfs\.io\/f\/[A-Za-z0-9._-]{6,200}$/.test(value)
  );
}

const trimmed = (max: number, min = 1) => z.string().trim().min(min).max(max);

export const postInputSchema = z
  .object({
    kind: z.enum(["POST", "QUESTION", "POLL"]).default("POST"),
    content: z.string().trim().max(POST_MAX_LENGTH, `Keep it under ${POST_MAX_LENGTH} characters.`).default(""),
    imageUrl: z
      .string()
      .refine(isCommunityImageUrl, "That picture didn't upload properly. Try again.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    groupId: z.string().min(1).max(40).optional().or(z.literal("").transform(() => undefined)),
    sharedPostId: z.string().min(1).max(40).optional().or(z.literal("").transform(() => undefined)),
    pollOptions: z.array(z.string().trim().max(120, "Keep each option under 120 characters.")).default([]),
  })
  .superRefine((data, ctx) => {
    const options = cleanPollOptions(data.pollOptions);
    if (data.kind === "POLL") {
      if (data.content.length < 3) ctx.addIssue({ code: "custom", message: "Ask the poll's question first." });
      if (options.length < POLL_MIN_OPTIONS) {
        ctx.addIssue({ code: "custom", message: `A poll needs at least ${POLL_MIN_OPTIONS} different options.` });
      }
      if (options.length > POLL_MAX_OPTIONS) {
        ctx.addIssue({ code: "custom", message: `A poll can have at most ${POLL_MAX_OPTIONS} options.` });
      }
      if (data.sharedPostId) ctx.addIssue({ code: "custom", message: "A shared post can't also be a poll." });
    } else if (data.kind === "QUESTION") {
      if (data.content.length < 10) ctx.addIssue({ code: "custom", message: "Write your question in a little more detail." });
    } else if (!data.content && !data.imageUrl && !data.sharedPostId) {
      ctx.addIssue({ code: "custom", message: "Write something or add a picture first." });
    }
  });

/** Trims, drops blanks and removes repeats (case-insensitive), keeping order. */
export function cleanPollOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options) {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export const commentInputSchema = z.object({
  postId: z.string().min(1).max(40),
  parentId: z.string().min(1).max(40).optional().or(z.literal("").transform(() => undefined)),
  content: trimmed(COMMENT_MAX_LENGTH).describe("comment"),
});

export const groupInputSchema = z.object({
  name: z.string().trim().min(3, "Give the group a name (3+ letters).").max(60),
  topic: z.string().trim().min(2, "Add a topic, like Physics or English.").max(40),
  description: z.string().trim().min(10, "Describe what the group is for.").max(600),
});

export const messageInputSchema = z.object({ body: trimmed(MESSAGE_MAX_LENGTH) });

export const reportInputSchema = z.object({
  targetType: z.enum(["POST", "COMMENT", "PROFILE"]),
  targetId: z.string().min(1).max(40),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});

export const profileInputSchema = z.object({
  bio: z.string().trim().max(500, "Keep your bio under 500 characters.").default(""),
  headline: z.string().trim().max(80, "Keep your headline under 80 characters.").default(""),
  communityPrivate: z.boolean().default(false),
});

export function firstIssue(error: z.ZodError, fallback = "That doesn't look right."): string {
  return error.errors[0]?.message ?? fallback;
}

// ---------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------

const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN"];

/** Site staff who can moderate any community content. */
export function isCommunityStaff(role: string): boolean {
  return STAFF_ROLES.includes(role);
}

type GroupRole = "OWNER" | "MODERATOR" | "MEMBER" | null | undefined;

/** Only the owner (or site staff) changes a group's details or its moderators. */
export function canManageGroup(input: { viewerRole: string; membership: GroupRole }): boolean {
  return isCommunityStaff(input.viewerRole) || input.membership === "OWNER";
}

/** Owners and moderators (and site staff) can remove posts and comments in their group. */
export function canModerateGroup(input: { viewerRole: string; membership: GroupRole }): boolean {
  return isCommunityStaff(input.viewerRole) || input.membership === "OWNER" || input.membership === "MODERATOR";
}

/**
 * Whether the viewer may delete a post or comment: its author, site staff,
 * or (inside a group) that group's owner and moderators. Nobody else.
 */
export function canDeleteContent(input: {
  viewerId: string;
  viewerRole: string;
  authorId: string;
  groupMembership?: GroupRole;
  inGroup?: boolean;
}): boolean {
  if (input.viewerId === input.authorId) return true;
  if (isCommunityStaff(input.viewerRole)) return true;
  return Boolean(input.inGroup) && (input.groupMembership === "OWNER" || input.groupMembership === "MODERATOR");
}

/** Only its author edits a post or comment. Staff hide or remove; they don't rewrite. */
export function canEditContent(viewerId: string, authorId: string): boolean {
  return viewerId === authorId;
}

/**
 * Whether the viewer may see someone's posts: always their own; a private
 * profile's posts only for followers (and staff, for moderation).
 */
export function canSeeProfilePosts(input: {
  viewerId: string;
  viewerRole: string;
  ownerId: string;
  ownerIsPrivate: boolean;
  viewerFollowsOwner: boolean;
}): boolean {
  if (input.viewerId === input.ownerId) return true;
  if (!input.ownerIsPrivate) return true;
  return input.viewerFollowsOwner || isCommunityStaff(input.viewerRole);
}

// ---------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------

/**
 * The (userAId, userBId) pair for two people: always the smaller id
 * first, so both of them resolve to the same conversation row.
 */
export function conversationPair(first: string, second: string): { userAId: string; userBId: string } {
  if (first === second) throw new Error("A conversation needs two different people.");
  return first < second ? { userAId: first, userBId: second } : { userAId: second, userBId: first };
}

/** Which side of a conversation `userId` is, or null if they are not in it. */
export function conversationSide(
  conversation: { userAId: string; userBId: string },
  userId: string
): "A" | "B" | null {
  if (conversation.userAId === userId) return "A";
  if (conversation.userBId === userId) return "B";
  return null;
}

// ---------------------------------------------------------------------
// Feed cursor: "<ISO createdAt>_<id>", so pages stay stable when two
// posts share a timestamp.
// ---------------------------------------------------------------------

export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return `${item.createdAt.toISOString()}_${item.id}`;
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor || cursor.length > 80) return null;
  const split = cursor.indexOf("_");
  if (split < 1) return null;
  const createdAt = new Date(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  if (Number.isNaN(createdAt.getTime()) || !/^[A-Za-z0-9]{6,40}$/.test(id)) return null;
  return { createdAt, id };
}

// ---------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

/**
 * Splits user text into plain text and http(s) links so the UI can render
 * links as real anchors without ever injecting HTML. Anything that is not
 * a plain http(s) URL stays text.
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    // Trailing punctuation belongs to the sentence, not the link.
    const raw = match[0].replace(/[.,!?;:)\]]+$/, "");
    let href: string;
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      href = url.toString();
    } catch {
      continue;
    }
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/** URL-safe group slug from its name; the caller adds a suffix if taken. */
export function groupSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "group";
}

export function displayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim() || "Proggaa hero";
}

export function communityTimeAgo(date: Date, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
}

// ---------------------------------------------------------------------
// Rewards (see server/services/community-rewards.ts)
// ---------------------------------------------------------------------

/** XP for having your answer marked useful by the person who asked. */
export const HELPFUL_ANSWER_XP = 15;
/** At most this many helpful-answer rewards per person per Dhaka day. */
export const HELPFUL_ANSWER_DAILY_CAP = 3;
