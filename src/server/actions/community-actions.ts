"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotificationOnce } from "@/lib/notifications/dedupe";
import {
  REACTION_TYPES,
  canDeleteContent,
  canManageGroup,
  canModerateGroup,
  canRemoveFromGroup,
  canSetGroupRole,
  cleanPollOptions,
  commentInputSchema,
  displayName,
  firstIssue,
  groupInputSchema,
  isCommunityStaff,
  groupSlug,
  postInputSchema,
  profileInputSchema,
  REEL_MAX_BYTES,
  REEL_MIME_TYPES,
  REEL_CHUNK_BYTES,
  reportInputSchema,
  type ReactionType,
} from "@/lib/community/rules";
import {
  getComments,
  getFeedPage,
  getPost,
  getReactors,
  newestPostId,
  visiblePostWhere,
  type CommentDTO,
  type FeedPage,
  type FeedScope,
  type PostDTO,
  type ReactorDTO,
} from "@/server/services/community";
import { checkFirstPostAchievement, rewardHelpfulAnswer } from "@/server/services/community-rewards";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { deleteUserFile } from "@/lib/storage";
import { isDriveConnected, startResumableUpload } from "@/lib/storage/google-drive";
import { changeUsername, checkUsername, type UsernameCheck } from "@/server/services/usernames";
import { requireActiveUser } from "./require-user";

// ---------------------------------------------------------------------
// Proggaa Community — every write. Each action:
//   - takes the acting user from the session, never from its arguments;
//   - re-checks ownership / membership / visibility on the server;
//   - validates its input with the schemas in lib/community/rules.ts and
//     writes only the fields it names (no object spreading from input);
//   - is rate limited per user;
//   - RETURNS { ok: false, error } so the message reaches the user.
// ---------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const TOO_FAST = "You're doing that a lot. Give it a minute and try again.";
const PAUSED = "The Community is paused for a moment. Please try again shortly.";

/** The admin "community" feature switch (the same one the Patrol Q&A uses). */
async function paused(user: { id: string; role: string }): Promise<boolean> {
  return !(await isFeatureEnabled("community", { userId: user.id, role: user.role }));
}

type Limit = "post" | "comment" | "react" | "report" | "group" | "follow" | "lookup" | "username";
const LIMIT_KIND: Record<Limit, "write" | "api" | "strict"> = {
  lookup: "api",
  username: "strict",
  post: "write",
  comment: "write",
  react: "api",
  follow: "api",
  report: "strict",
  group: "strict",
};

async function limited(kind: Limit, userId: string): Promise<boolean> {
  const { success } = await checkRateLimit(LIMIT_KIND[kind], `community:${kind}:${userId}`);
  return !success;
}

/** Sends a notification unless it would be to yourself; repeats within six hours are folded. */
async function notify(
  type: "COMMUNITY_REACTION" | "COMMUNITY_COMMENT" | "COMMUNITY_FOLLOW" | "COMMUNITY_ANSWER",
  actorId: string,
  recipientId: string,
  title: string,
  body: string,
  linkUrl: string
) {
  if (actorId === recipientId) return;
  try {
    await createNotificationOnce(
      type,
      { userId: recipientId, title, body: body.slice(0, 180), linkUrl },
      { since: new Date(Date.now() - 6 * 3_600_000) }
    );
  } catch {
    // A notification failing must never fail the action that caused it.
  }
}

function revalidateCommunity(extra?: string) {
  revalidatePath("/community", "layout");
  if (extra) revalidatePath(extra);
}

// ---------------------------------------------------------------------
// Feed paging (read-only, but called from the client's "load more")
// ---------------------------------------------------------------------

/**
 * Rebuilds a client-sent scope field by field: the client only ever names a
 * scope, it can't smuggle in a different viewer or an arbitrary filter.
 */
function safeScope(scope: unknown): FeedScope | null {
  if (!scope || typeof scope !== "object" || typeof (scope as { type?: unknown }).type !== "string") return null;
  const s = scope as Record<string, unknown>;
  switch (s.type) {
    case "following":
    case "questions":
    case "trending":
    case "saved":
    case "all":
      return { type: s.type };
    case "profile":
      return typeof s.userId === "string" ? { type: "profile", userId: s.userId.slice(0, 40) } : null;
    case "group":
      return typeof s.groupId === "string" ? { type: "group", groupId: s.groupId.slice(0, 40) } : null;
    case "reels":
      return typeof s.userId === "string" ? { type: "reels", userId: s.userId.slice(0, 40) } : { type: "reels" };
    case "search":
      return typeof s.query === "string" && s.query.trim().length >= 2
        ? { type: "search", query: s.query.trim().slice(0, 80) }
        : null;
    default:
      return null;
  }
}

export async function loadFeedPage(scope: FeedScope, cursor: string | null): Promise<Result<FeedPage>> {
  const user = await requireActiveUser();
  const safe = safeScope(scope);
  if (!safe) return fail("Couldn't load more posts.");
  const page = await getFeedPage(user, safe, typeof cursor === "string" ? cursor : null);
  return { ok: true, ...page };
}

/** The newest post id in a scope, so an open feed can offer "New posts". */
export async function peekNewestPost(scope: FeedScope): Promise<Result<{ id: string | null }>> {
  const user = await requireActiveUser();
  const safe = safeScope(scope);
  if (!safe) return fail("Couldn't check for new posts.");
  return { ok: true, id: await newestPostId(user, safe) };
}

/** One post, shaped for a feed (used to show a post right after it is written). */
export async function loadPost(postId: string): Promise<Result<{ post: PostDTO }>> {
  const user = await requireActiveUser();
  const post = await getPost(user, String(postId).slice(0, 40));
  if (!post) return fail("That post is no longer available.");
  return { ok: true, post };
}

/** Who reacted to a post, with which reaction. */
export async function loadReactors(postId: string): Promise<Result<{ people: ReactorDTO[] }>> {
  const user = await requireActiveUser();
  const people = await getReactors(user, String(postId).slice(0, 40));
  if (!people) return fail("That post is no longer available.");
  return { ok: true, people };
}

export async function loadComments(
  postId: string,
  cursor: string | null
): Promise<Result<{ comments: CommentDTO[]; nextCursor: string | null }>> {
  const user = await requireActiveUser();
  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: String(postId) }, visiblePostWhere(user)] },
    select: { id: true, groupId: true },
  });
  if (!post) return fail("That post is no longer available.");
  return { ok: true, ...(await getComments(user, post, cursor)) };
}

// ---------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------

export async function createPost(input: unknown): Promise<Result<{ postId: string }>> {
  const user = await requireActiveUser();
  if (await paused(user)) return fail(PAUSED);
  if (await limited("post", user.id)) return fail(TOO_FAST);

  const parsed = postInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const data = parsed.data;

  let groupSlugForPath: string | null = null;
  if (data.groupId) {
    // Only members post in a group.
    const membership = await db.communityGroupMember.findUnique({
      where: { groupId_userId: { groupId: data.groupId, userId: user.id } },
      select: { group: { select: { slug: true } } },
    });
    if (!membership) return fail("Join the group before posting in it.");
    groupSlugForPath = membership.group.slug;
  }

  let sharedPostId: string | null = null;
  let originalAuthorId: string | null = null;
  if (data.sharedPostId) {
    const original = await db.communityPost.findFirst({
      where: { AND: [{ id: data.sharedPostId }, visiblePostWhere(user)] },
      select: { id: true, authorId: true, sharedPostId: true, author: { select: { communityPrivate: true } } },
    });
    if (!original) return fail("That post is no longer available to share.");
    if (original.author.communityPrivate && original.authorId !== user.id) {
      return fail("Posts from a private profile can't be shared.");
    }
    // Sharing a share points at the original, so attribution stays with its author.
    sharedPostId = original.sharedPostId ?? original.id;
    originalAuthorId = original.authorId;
  }

  if (data.imageUrl) {
    // The picture must be one this user uploaded as a community image.
    const uploadId = data.imageUrl.split("/").pop()!;
    const upload = await db.upload.findFirst({
      where: {
        uploaderId: user.id,
        context: "COMMUNITY_IMAGE",
        OR: [{ url: data.imageUrl }, { id: uploadId }],
      },
      select: { id: true },
    });
    if (!upload) return fail("That picture didn't upload properly. Try again.");
  }

  let videoUploadId: string | null = null;
  if (data.kind === "REEL") {
    // The video must be this user's own, fully uploaded reel file, not yet used by another reel.
    const uploadId = data.videoUrl!.split("/").pop()!;
    const video = await db.upload.findFirst({
      where: { id: uploadId, uploaderId: user.id, context: "COMMUNITY_VIDEO", url: data.videoUrl, resumableUrl: null },
      select: { id: true, driveFileId: true },
    });
    if (!video?.driveFileId) return fail("The video didn't finish uploading. Try again.");
    videoUploadId = video.id;
  }

  const options = data.kind === "POLL" ? cleanPollOptions(data.pollOptions) : [];
  let post: { id: string };
  try {
    post = await db.communityPost.create({
      data: {
        authorId: user.id,
        groupId: data.groupId ?? null,
        kind: data.kind,
        content: data.content,
        imageUrl: data.imageUrl ?? null,
        sharedPostId,
        videoUrl: data.kind === "REEL" ? data.videoUrl : null,
        videoDurationSec: data.kind === "REEL" ? data.videoDurationSec ?? null : null,
        pollOptions: options.length ? { create: options.map((label, order) => ({ label, order })) } : undefined,
      },
      select: { id: true },
    });
  } catch (err) {
    // videoUrl is unique: the same video can't be posted as two reels.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("That video is already posted.");
    throw err;
  }
  if (videoUploadId) await db.upload.update({ where: { id: videoUploadId }, data: { consumedAt: new Date() } });

  if (originalAuthorId) {
    await notify(
      "COMMUNITY_REACTION",
      user.id,
      originalAuthorId,
      `${displayName(user)} shared your post`,
      data.content || "Tap to see it.",
      `/community/post/${post.id}`
    );
  }
  await checkFirstPostAchievement(user.id).catch(() => {});

  revalidateCommunity(groupSlugForPath ? `/community/groups/${groupSlugForPath}` : undefined);
  return { ok: true, postId: post.id };
}

export async function updatePost(postId: string, content: string): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("post", user.id)) return fail(TOO_FAST);

  const text = typeof content === "string" ? content.trim() : "";
  const post = await db.communityPost.findUnique({
    where: { id: String(postId) },
    select: { authorId: true, kind: true, imageUrl: true, sharedPostId: true },
  });
  // Same answer for "not found" and "not yours".
  if (!post || post.authorId !== user.id) return fail("You can only edit your own posts.");
  if (text.length > 5000) return fail("Keep it under 5000 characters.");
  if (post.kind === "POLL" && text.length < 3) return fail("A poll needs its question.");
  if (post.kind === "QUESTION" && text.length < 10) return fail("Write your question in a little more detail.");
  if (!text && !post.imageUrl && !post.sharedPostId && post.kind !== "REEL") return fail("A post can't be empty.");

  await db.communityPost.update({ where: { id: String(postId) }, data: { content: text, editedAt: new Date() } });
  revalidateCommunity(`/community/post/${postId}`);
  return { ok: true };
}

export async function deletePost(postId: string): Promise<Result> {
  const user = await requireActiveUser();
  const post = await db.communityPost.findUnique({
    where: { id: String(postId) },
    select: { authorId: true, groupId: true, kind: true, videoUrl: true, imageUrl: true, group: { select: { slug: true } } },
  });
  if (!post) return { ok: true }; // already gone
  const membership = post.groupId
    ? await db.communityGroupMember.findUnique({
        where: { groupId_userId: { groupId: post.groupId, userId: user.id } },
        select: { role: true },
      })
    : null;
  const allowed = canDeleteContent({
    viewerId: user.id,
    viewerRole: user.role,
    authorId: post.authorId,
    inGroup: Boolean(post.groupId),
    groupMembership: membership?.role,
  });
  if (!allowed) return fail("You can't delete that post.");

  await db.communityPost.delete({ where: { id: String(postId) } });
  if (post.kind === "REEL") {
    // A reel's video is large: remove it (and its cover) from Drive too. Best effort.
    for (const url of [post.videoUrl, post.imageUrl]) {
      const id = url?.startsWith("/api/files/") ? url.split("/").pop() : null;
      if (id) await deleteUserFile(id).catch((err) => console.error(`Couldn't delete reel file ${id}:`, err));
    }
  }
  revalidateCommunity(post.group ? `/community/groups/${post.group.slug}` : undefined);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Reels
// ---------------------------------------------------------------------

/**
 * Starts a reel upload: opens a Drive resumable upload for the declared
 * file and records it as this user's pending COMMUNITY_VIDEO upload. The
 * browser then sends the bytes in chunks to /api/reels/upload/<uploadId>,
 * which forwards them to Drive. Drive's session address never leaves the
 * server.
 */
export async function startReelUpload(input: {
  name: string;
  type: string;
  size: number;
}): Promise<Result<{ uploadId: string; chunkBytes: number }>> {
  const user = await requireActiveUser();
  if (await paused(user)) return fail(PAUSED);
  if (await limited("post", user.id)) return fail(TOO_FAST);

  const type = String(input?.type ?? "");
  const size = Number(input?.size);
  if (!(REEL_MIME_TYPES as readonly string[]).includes(type)) return fail("Choose an MP4, MOV or WebM video.");
  if (!Number.isInteger(size) || size <= 0) return fail("That video looks empty.");
  if (size > REEL_MAX_BYTES) return fail(`Keep the video under ${Math.round(REEL_MAX_BYTES / 1024 / 1024)} MB.`);
  if (!(await isDriveConnected().catch(() => false))) {
    return fail("Reels are switched off for a moment (video storage isn't connected). Please try later.");
  }

  const ext = type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : "mp4";
  const filename = `reel-${user.id}-${Date.now()}.${ext}`;
  let sessionUrl: string;
  try {
    sessionUrl = await startResumableUpload({ context: "COMMUNITY_VIDEO", filename, mimeType: type, size });
  } catch (err) {
    console.error("Couldn't start a reel upload:", err);
    return fail("Couldn't start the upload. Please try again.");
  }
  const marker = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const upload = await db.upload.create({
    data: {
      uploaderId: user.id,
      context: "COMMUNITY_VIDEO",
      provider: "GOOGLE_DRIVE",
      key: `drive-pending:${marker}`,
      url: `pending:${marker}`,
      name: filename,
      sizeBytes: size,
      fileType: type,
      resumableUrl: sessionUrl,
    },
    select: { id: true },
  });
  return { ok: true, uploadId: upload.id, chunkBytes: REEL_CHUNK_BYTES };
}

/** Counts one watch of a reel (the player calls it once per reel per visit, after a couple of seconds). */
export async function countReelView(postId: string): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return { ok: true };
  await db.communityPost.updateMany({
    where: { AND: [{ id: String(postId) }, { kind: "REEL" }, { authorId: { not: user.id } }, visiblePostWhere(user)] },
    data: { viewCount: { increment: 1 } },
  });
  return { ok: true };
}

export async function toggleSavePost(postId: string): Promise<Result<{ saved: boolean }>> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return fail(TOO_FAST);
  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: String(postId) }, visiblePostWhere(user)] },
    select: { id: true },
  });
  if (!post) return fail("That post is no longer available.");

  const removed = await db.communitySavedPost.deleteMany({ where: { userId: user.id, postId: post.id } });
  if (removed.count > 0) {
    revalidatePath("/community/saved");
    return { ok: true, saved: false };
  }
  try {
    await db.communitySavedPost.create({ data: { userId: user.id, postId: post.id } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  revalidatePath("/community/saved");
  return { ok: true, saved: true };
}

// ---------------------------------------------------------------------
// Reactions and polls
// ---------------------------------------------------------------------

/**
 * Sets, changes or clears the current user's reaction on a post
 * (`type: null` clears it; the same type again also clears it).
 * One row per person per post, enforced by the unique constraint, so the
 * count can't be pushed up by repeating or racing the request.
 */
export async function setReaction(
  postId: string,
  type: ReactionType | null
): Promise<Result<{ myReaction: ReactionType | null; reactionCount: number }>> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return fail(TOO_FAST);
  if (type !== null && !REACTION_TYPES.includes(type)) return fail("That reaction isn't available.");

  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: String(postId) }, visiblePostWhere(user)] },
    select: { id: true, authorId: true, content: true },
  });
  if (!post) return fail("That post is no longer available.");

  const existing = await db.communityReaction.findUnique({
    where: { postId_userId: { postId: post.id, userId: user.id } },
    select: { type: true },
  });

  let mine: ReactionType | null;
  if (type === null || existing?.type === type) {
    await db.communityReaction.deleteMany({ where: { postId: post.id, userId: user.id } });
    mine = null;
  } else {
    try {
      await db.communityReaction.upsert({
        where: { postId_userId: { postId: post.id, userId: user.id } },
        create: { postId: post.id, userId: user.id, type },
        update: { type },
      });
    } catch (err) {
      // Two taps racing: the other request created the row first. Keep it, set the type.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      await db.communityReaction.updateMany({ where: { postId: post.id, userId: user.id }, data: { type } });
    }
    mine = type;
    if (!existing) {
      await notify(
        "COMMUNITY_REACTION",
        user.id,
        post.authorId,
        `${displayName(user)} reacted to your post`,
        post.content || "Tap to see it.",
        `/community/post/${post.id}`
      );
    }
  }
  const reactionCount = await db.communityReaction.count({ where: { postId: post.id } });
  return { ok: true, myReaction: mine, reactionCount };
}

/**
 * Casts the current user's vote. One vote per person per poll (unique
 * constraint); a vote can be moved to another option while the poll is
 * open, never added to. The option must belong to this poll.
 */
export async function votePoll(
  postId: string,
  optionId: string
): Promise<Result<{ options: { id: string; votes: number }[]; myOptionId: string }>> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return fail(TOO_FAST);

  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: String(postId) }, { kind: "POLL" }, visiblePostWhere(user)] },
    select: { id: true, pollClosesAt: true, pollOptions: { select: { id: true } } },
  });
  if (!post) return fail("That poll is no longer available.");
  if (post.pollClosesAt && post.pollClosesAt.getTime() < Date.now()) return fail("This poll has closed.");
  if (!post.pollOptions.some((o) => o.id === optionId)) return fail("That option isn't part of this poll.");

  try {
    await db.communityPollVote.upsert({
      where: { postId_userId: { postId: post.id, userId: user.id } },
      create: { postId: post.id, userId: user.id, optionId },
      update: { optionId },
    });
  } catch (err) {
    // Two votes racing: the other request made the row. Still one vote; move it.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    await db.communityPollVote.updateMany({ where: { postId: post.id, userId: user.id }, data: { optionId } });
  }

  const counts = await db.communityPollOption.findMany({
    where: { postId: post.id },
    orderBy: { order: "asc" },
    select: { id: true, _count: { select: { votes: true } } },
  });
  return { ok: true, myOptionId: optionId, options: counts.map((o) => ({ id: o.id, votes: o._count.votes })) };
}

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------

export async function addComment(input: unknown): Promise<Result<{ commentId: string }>> {
  const user = await requireActiveUser();
  if (await paused(user)) return fail(PAUSED);
  if (await limited("comment", user.id)) return fail(TOO_FAST);

  const parsed = commentInputSchema.safeParse(input);
  if (!parsed.success) return fail("Write a comment first (up to 2000 characters).");
  const data = parsed.data;

  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: data.postId }, visiblePostWhere(user)] },
    select: { id: true, authorId: true, kind: true },
  });
  if (!post) return fail("That post is no longer available.");

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (data.parentId) {
    const parent = await db.communityComment.findFirst({
      where: { id: data.parentId, postId: post.id, isHidden: false },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!parent) return fail("The comment you're replying to is gone.");
    // One level deep: a reply to a reply joins the same thread.
    parentId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const comment = await db.communityComment.create({
    data: { postId: post.id, authorId: user.id, parentId, content: data.content },
    select: { id: true },
  });

  const link = `/community/post/${post.id}`;
  const name = displayName(user);
  if (parentAuthorId) {
    await notify("COMMUNITY_COMMENT", user.id, parentAuthorId, `${name} replied to your comment`, data.content, link);
  }
  if (post.authorId !== parentAuthorId) {
    await notify(
      "COMMUNITY_COMMENT",
      user.id,
      post.authorId,
      post.kind === "QUESTION" ? `${name} answered your question` : `${name} commented on your post`,
      data.content,
      link
    );
  }

  revalidateCommunity(link);
  return { ok: true, commentId: comment.id };
}

/**
 * Likes or un-likes a comment. One row per person per comment (unique
 * constraint), so racing taps can't raise the count.
 */
export async function toggleCommentLike(commentId: string): Promise<Result<{ liked: boolean; likeCount: number }>> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return fail(TOO_FAST);

  const comment = await db.communityComment.findFirst({
    where: { id: String(commentId), isHidden: false, post: visiblePostWhere(user) },
    select: { id: true, authorId: true, postId: true, content: true },
  });
  if (!comment) return fail("That comment is no longer available.");

  const removed = await db.communityCommentLike.deleteMany({ where: { commentId: comment.id, userId: user.id } });
  let liked = false;
  if (removed.count === 0) {
    try {
      await db.communityCommentLike.create({ data: { commentId: comment.id, userId: user.id } });
      await notify(
        "COMMUNITY_REACTION",
        user.id,
        comment.authorId,
        `${displayName(user)} liked your comment`,
        comment.content,
        `/community/post/${comment.postId}`
      );
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    liked = true;
  }
  const likeCount = await db.communityCommentLike.count({ where: { commentId: comment.id } });
  return { ok: true, liked, likeCount };
}

export async function updateComment(commentId: string, content: string): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("comment", user.id)) return fail(TOO_FAST);
  const text = typeof content === "string" ? content.trim() : "";
  if (!text || text.length > 2000) return fail("Write a comment first (up to 2000 characters).");

  const updated = await db.communityComment.updateMany({
    // Ownership is part of the WHERE, so it can't touch anyone else's comment.
    where: { id: String(commentId), authorId: user.id },
    data: { content: text, editedAt: new Date() },
  });
  if (updated.count === 0) return fail("You can only edit your own comments.");
  revalidateCommunity();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const user = await requireActiveUser();
  const comment = await db.communityComment.findUnique({
    where: { id: String(commentId) },
    select: { authorId: true, postId: true, post: { select: { groupId: true } } },
  });
  if (!comment) return { ok: true };
  const membership = comment.post.groupId
    ? await db.communityGroupMember.findUnique({
        where: { groupId_userId: { groupId: comment.post.groupId, userId: user.id } },
        select: { role: true },
      })
    : null;
  const allowed = canDeleteContent({
    viewerId: user.id,
    viewerRole: user.role,
    authorId: comment.authorId,
    inGroup: Boolean(comment.post.groupId),
    groupMembership: membership?.role,
  });
  if (!allowed) return fail("You can't delete that comment.");

  await db.communityComment.delete({ where: { id: String(commentId) } });
  revalidateCommunity(`/community/post/${comment.postId}`);
  return { ok: true };
}

/**
 * The asker marks (or un-marks) the answer that helped. Only the question's
 * author can, and never on their own comment. The answerer may earn XP:
 * see rewardHelpfulAnswer for the limits.
 */
export async function setAcceptedAnswer(postId: string, commentId: string | null): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("react", user.id)) return fail(TOO_FAST);

  const post = await db.communityPost.findUnique({
    where: { id: String(postId) },
    select: { id: true, authorId: true, kind: true, content: true },
  });
  if (!post || post.authorId !== user.id) return fail("Only the person who asked can mark the useful answer.");
  if (post.kind !== "QUESTION") return fail("Only questions have a useful answer.");

  if (commentId === null) {
    await db.communityPost.update({ where: { id: post.id }, data: { acceptedCommentId: null } });
    revalidateCommunity(`/community/post/${post.id}`);
    return { ok: true };
  }

  const comment = await db.communityComment.findFirst({
    where: { id: String(commentId), postId: post.id, isHidden: false },
    select: { id: true, authorId: true },
  });
  if (!comment) return fail("That answer is no longer available.");
  if (comment.authorId === user.id) return fail("You can't mark your own comment as the useful answer.");

  await db.communityPost.update({ where: { id: post.id }, data: { acceptedCommentId: comment.id } });
  await rewardHelpfulAnswer({ questionId: post.id, askerId: user.id, answererId: comment.authorId }).catch(() => {});
  await notify(
    "COMMUNITY_ANSWER",
    user.id,
    comment.authorId,
    `${displayName(user)} marked your answer as useful`,
    post.content,
    `/community/post/${post.id}`
  );
  revalidateCommunity(`/community/post/${post.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Following and profile
// ---------------------------------------------------------------------

export async function toggleFollow(targetUserId: string): Promise<Result<{ following: boolean; followerCount: number }>> {
  const user = await requireActiveUser();
  if (await limited("follow", user.id)) return fail(TOO_FAST);
  const targetId = String(targetUserId);
  if (targetId === user.id) return fail("You can't follow yourself.");

  const target = await db.user.findFirst({
    where: { id: targetId, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (!target) return fail("That profile isn't available.");

  const removed = await db.communityFollow.deleteMany({ where: { followerId: user.id, followingId: targetId } });
  let following = false;
  if (removed.count === 0) {
    try {
      await db.communityFollow.create({ data: { followerId: user.id, followingId: targetId } });
      await notify(
        "COMMUNITY_FOLLOW",
        user.id,
        targetId,
        `${displayName(user)} started following you`,
        "See their profile.",
        `/community/u/${user.id}`
      );
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    following = true;
  }
  const followerCount = await db.communityFollow.count({ where: { followingId: targetId } });
  revalidateCommunity(`/community/u/${targetId}`);
  return { ok: true, following, followerCount };
}

/** Edits the current user's own bio, headline and privacy. There is no user id to pass. */
export async function updateCommunityProfile(input: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("post", user.id)) return fail(TOO_FAST);
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await db.user.update({
    where: { id: user.id },
    data: {
      bio: parsed.data.bio || null,
      headline: parsed.data.headline || null,
      communityPrivate: parsed.data.communityPrivate,
    },
  });
  revalidateCommunity(`/community/u/${user.id}`);
  return { ok: true };
}

/** Whether a username is free for the current user, with close free ones when it isn't (checked as they type). */
export async function lookUpUsername(raw: unknown): Promise<Result<{ check: UsernameCheck }>> {
  const user = await requireActiveUser();
  if (typeof raw !== "string") return fail("Type a username.");
  if (await limited("lookup", user.id)) return fail(TOO_FAST);
  return { ok: true, check: await checkUsername(user.id, raw) };
}

/** Sets the current user's own username, if it is valid and free. */
export async function setUsername(raw: unknown): Promise<Result<{ username: string }> | { ok: false; error: string; suggestions?: string[] }> {
  const user = await requireActiveUser();
  if (typeof raw !== "string") return fail("Type a username.");
  if (await limited("username", user.id)) return fail(TOO_FAST);
  const res = await changeUsername(user.id, raw);
  if (res.ok) revalidateCommunity(`/community/u/${user.id}`);
  return res;
}

// ---------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------

const MAX_GROUPS_OWNED = 5;

export async function createGroup(input: unknown): Promise<Result<{ slug: string }>> {
  const user = await requireActiveUser();
  if (await paused(user)) return fail(PAUSED);
  if (await limited("group", user.id)) return fail(TOO_FAST);
  const parsed = groupInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const owned = await db.communityGroup.count({ where: { ownerId: user.id } });
  if (owned >= MAX_GROUPS_OWNED) return fail(`You can run up to ${MAX_GROUPS_OWNED} groups.`);

  const base = groupSlug(parsed.data.name);
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await db.communityGroup.create({
        data: {
          slug,
          name: parsed.data.name,
          topic: parsed.data.topic,
          description: parsed.data.description,
          privacy: parsed.data.privacy,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      revalidateCommunity("/community/groups");
      return { ok: true, slug };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // slug taken
      throw err;
    }
  }
  return fail("Couldn't create the group. Try a slightly different name.");
}

export async function updateGroup(groupId: string, input: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("group", user.id)) return fail(TOO_FAST);
  const parsed = groupInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const group = await db.communityGroup.findUnique({
    where: { id: String(groupId) },
    select: { slug: true, members: { where: { userId: user.id }, select: { role: true }, take: 1 } },
  });
  if (!group || !canManageGroup({ viewerRole: user.role, membership: group.members[0]?.role })) {
    return fail("Only the group's owner and admins can change it.");
  }
  await db.communityGroup.update({
    where: { id: String(groupId) },
    data: { name: parsed.data.name, topic: parsed.data.topic, description: parsed.data.description, privacy: parsed.data.privacy },
  });
  // Opening a private group lets in everyone who was waiting.
  if (parsed.data.privacy === "PUBLIC") await admitAllRequests(String(groupId));
  revalidateCommunity(`/community/groups/${group.slug}`);
  return { ok: true };
}

export async function deleteGroup(groupId: string): Promise<Result> {
  const user = await requireActiveUser();
  const group = await db.communityGroup.findUnique({
    where: { id: String(groupId) },
    select: { members: { where: { userId: user.id }, select: { role: true }, take: 1 } },
  });
  if (!group || !(group.members[0]?.role === "OWNER" || isCommunityStaff(user.role))) {
    return fail("Only the group's owner can delete it.");
  }
  await db.communityGroup.delete({ where: { id: String(groupId) } });
  revalidateCommunity("/community/groups");
  return { ok: true };
}

/**
 * Join or leave a group. A public group is joined at once. A private one
 * gets a join request instead (pressing again cancels it), which its
 * admins or moderators approve.
 */
export async function toggleGroupMembership(
  groupId: string
): Promise<Result<{ joined: boolean; requested: boolean; memberCount: number }>> {
  const user = await requireActiveUser();
  if (await limited("follow", user.id)) return fail(TOO_FAST);
  const id = String(groupId);
  const group = await db.communityGroup.findUnique({ where: { id }, select: { slug: true, name: true, privacy: true } });
  if (!group) return fail("That group no longer exists.");

  const mine = await db.communityGroupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
    select: { role: true },
  });
  let joined = false;
  let requested = false;
  if (mine) {
    if (mine.role === "OWNER") return fail("You own this group. Delete it, or hand it over first.");
    await db.communityGroupMember.deleteMany({ where: { groupId: id, userId: user.id } });
  } else if (group.privacy === "PRIVATE" && !isCommunityStaff(user.role)) {
    const pending = await db.communityGroupJoinRequest.findUnique({
      where: { groupId_userId: { groupId: id, userId: user.id } },
      select: { id: true },
    });
    if (pending) {
      await db.communityGroupJoinRequest.deleteMany({ where: { groupId: id, userId: user.id } });
    } else {
      try {
        await db.communityGroupJoinRequest.create({ data: { groupId: id, userId: user.id } });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
      requested = true;
      await notifyGroupStaff(id, user.id, {
        title: `${displayName(user)} asked to join ${group.name}`,
        body: "Open the group to approve or decline.",
        linkUrl: `/community/groups/${group.slug}`,
      });
    }
  } else {
    try {
      // Always joins as a plain member: the role is never taken from the client.
      await db.communityGroupMember.create({ data: { groupId: id, userId: user.id, role: "MEMBER" } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    joined = true;
  }
  const memberCount = await db.communityGroupMember.count({ where: { groupId: id } });
  revalidateCommunity(`/community/groups/${group.slug}`);
  return { ok: true, joined, requested, memberCount };
}

/** Admins and moderators let someone into a private group, or turn them down. */
export async function respondToJoinRequest(groupId: string, requesterId: string, approve: boolean): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("follow", user.id)) return fail(TOO_FAST);
  const id = String(groupId);
  const group = await db.communityGroup.findUnique({
    where: { id },
    select: { slug: true, name: true, members: { where: { userId: user.id }, select: { role: true }, take: 1 } },
  });
  if (!group || !canModerateGroup({ viewerRole: user.role, membership: group.members[0]?.role })) {
    return fail("Only the group's admins and moderators can answer join requests.");
  }
  const { count } = await db.communityGroupJoinRequest.deleteMany({ where: { groupId: id, userId: String(requesterId) } });
  if (count === 0) return fail("That request was already answered.");
  if (approve) {
    try {
      await db.communityGroupMember.create({ data: { groupId: id, userId: String(requesterId), role: "MEMBER" } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    try {
      await db.notification.create({
        data: {
          userId: String(requesterId),
          type: "COMMUNITY_MODERATION",
          title: `You're in! Welcome to ${group.name}`,
          body: "Your request to join was approved.",
          linkUrl: `/community/groups/${group.slug}`,
        },
      });
    } catch {
      // Approval stands even if the notification fails.
    }
  }
  revalidateCommunity(`/community/groups/${group.slug}`);
  return { ok: true };
}

/** Gives a member a new role (admin, moderator or member), within what the actor may do (see canSetGroupRole). */
export async function setGroupMemberRole(groupId: string, memberUserId: string, role: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("group", user.id)) return fail(TOO_FAST);
  if (role !== "ADMIN" && role !== "MODERATOR" && role !== "MEMBER") return fail("Pick a role.");
  const id = String(groupId);
  const [group, target] = await Promise.all([
    db.communityGroup.findUnique({
      where: { id },
      select: { slug: true, members: { where: { userId: user.id }, select: { role: true }, take: 1 } },
    }),
    db.communityGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: String(memberUserId) } },
      select: { id: true, role: true },
    }),
  ]);
  if (!group) return fail("That group no longer exists.");
  if (!target) return fail("That person isn't a member of this group.");
  if (!canSetGroupRole({ viewerRole: user.role, actor: group.members[0]?.role, target: target.role, to: role })) {
    return fail(
      role === "ADMIN" || target.role === "ADMIN"
        ? "Only the group's owner chooses admins."
        : "Only the group's owner and admins choose moderators."
    );
  }
  await db.communityGroupMember.update({ where: { id: target.id }, data: { role } });
  revalidateCommunity(`/community/groups/${group.slug}`);
  return { ok: true };
}

/** Kept for existing callers: make a member a moderator, or a plain member again. */
export async function setGroupModerator(groupId: string, memberUserId: string, moderator: boolean): Promise<Result> {
  return setGroupMemberRole(groupId, memberUserId, moderator ? "MODERATOR" : "MEMBER");
}

/** Removes someone from a group: only people ranked below you (see canRemoveFromGroup). */
export async function removeGroupMember(groupId: string, memberUserId: string): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("group", user.id)) return fail(TOO_FAST);
  const id = String(groupId);
  const [group, target] = await Promise.all([
    db.communityGroup.findUnique({
      where: { id },
      select: { slug: true, members: { where: { userId: user.id }, select: { role: true }, take: 1 } },
    }),
    db.communityGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: String(memberUserId) } },
      select: { id: true, role: true },
    }),
  ]);
  if (!group) return fail("That group no longer exists.");
  if (!target) return fail("That person isn't a member of this group.");
  if (!canRemoveFromGroup({ viewerRole: user.role, actor: group.members[0]?.role, target: target.role })) {
    return fail("You can only remove people with a lower role than yours.");
  }
  await db.communityGroupMember.delete({ where: { id: target.id } });
  revalidateCommunity(`/community/groups/${group.slug}`);
  return { ok: true };
}

/** Everyone waiting to join becomes a member (when a group is made public). */
async function admitAllRequests(groupId: string) {
  const waiting = await db.communityGroupJoinRequest.findMany({ where: { groupId }, select: { userId: true }, take: 500 });
  if (waiting.length === 0) return;
  await db.$transaction([
    db.communityGroupMember.createMany({
      data: waiting.map((w) => ({ groupId, userId: w.userId, role: "MEMBER" as const })),
      skipDuplicates: true,
    }),
    db.communityGroupJoinRequest.deleteMany({ where: { groupId } }),
  ]);
}

/** Tells a group's owner, admins and moderators about something waiting for them. */
async function notifyGroupStaff(groupId: string, actorId: string, item: { title: string; body: string; linkUrl: string }) {
  try {
    const staff = await db.communityGroupMember.findMany({
      where: { groupId, role: { in: ["OWNER", "ADMIN", "MODERATOR"] }, userId: { not: actorId } },
      select: { userId: true },
      take: 20,
    });
    for (const s of staff) {
      await createNotificationOnce("COMMUNITY_MODERATION", { userId: s.userId, ...item }, { since: new Date(Date.now() - 6 * 3_600_000) });
    }
  } catch {
    // The request itself was saved; a failed notification must not undo it.
  }
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export async function reportContent(input: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (await limited("report", user.id)) return fail(TOO_FAST);
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return fail("Choose a reason for the report.");
  const { targetType, targetId, reason, details } = parsed.data;

  let target: { postId?: string; commentId?: string; targetUserId?: string };
  if (targetType === "POST") {
    const post = await db.communityPost.findFirst({
      where: { AND: [{ id: targetId }, visiblePostWhere(user)] },
      select: { id: true, authorId: true },
    });
    if (!post) return fail("That post is no longer available.");
    if (post.authorId === user.id) return fail("You can't report your own post. You can delete it.");
    target = { postId: post.id };
  } else if (targetType === "COMMENT") {
    const comment = await db.communityComment.findUnique({
      where: { id: targetId },
      select: { id: true, authorId: true },
    });
    if (!comment) return fail("That comment is no longer available.");
    if (comment.authorId === user.id) return fail("You can't report your own comment. You can delete it.");
    target = { commentId: comment.id };
  } else {
    if (targetId === user.id) return fail("You can't report yourself.");
    const person = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!person) return fail("That profile isn't available.");
    target = { targetUserId: person.id };
  }

  // Already reported by this person: nothing more to do (the unique
  // constraint below still covers two requests racing).
  const existing = await db.communityReport.findUnique({
    where: { reporterId_targetType_targetKey: { reporterId: user.id, targetType, targetKey: targetId } },
    select: { id: true },
  });
  if (existing) return { ok: true };

  try {
    await db.communityReport.create({
      data: { reporterId: user.id, targetType, targetKey: targetId, reason, details: details ?? null, ...target },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: true }; // already reported by this person: nothing more to do
    }
    throw err;
  }
  revalidatePath("/admin/community");
  return { ok: true };
}
