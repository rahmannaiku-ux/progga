import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
import {
  COMMENTS_PAGE_SIZE,
  FEED_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
  canDeleteContent,
  canSeeProfilePosts,
  conversationSide,
  decodeCursor,
  displayName,
  encodeCursor,
  isCommunityStaff,
  type ReactionType,
} from "@/lib/community/rules";

// ---------------------------------------------------------------------
// Proggaa Community — read side. Everything here takes the viewer and
// applies visibility itself, so a page can't forget to. Results are plain
// serialisable objects (dates as ISO strings) because the same shapes go
// to client components and come back from "load more" server actions.
// Every list is bounded.
// ---------------------------------------------------------------------

export type Viewer = { id: string; role: string };

/** What other people may see of someone. Never phone, email or grades. */
const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  headline: true,
  role: true,
} as const;

export type PersonDTO = {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  isMentor: boolean;
};

type AuthorRow = { id: string; firstName: string; lastName: string; avatarUrl: string | null; headline: string | null; role: string };

export function toPerson(user: AuthorRow): PersonDTO {
  return {
    id: user.id,
    name: displayName(user),
    avatarUrl: user.avatarUrl,
    headline: user.headline,
    isMentor: user.role !== "STUDENT",
  };
}

export type PostDTO = {
  id: string;
  kind: "POST" | "QUESTION" | "POLL";
  content: string;
  imageUrl: string | null;
  createdAt: string;
  edited: boolean;
  isHidden: boolean;
  author: PersonDTO;
  group: { slug: string; name: string } | null;
  /** A repost: the original, `"removed"` if it is gone or not visible, or null. */
  shared: { id: string; content: string; imageUrl: string | null; createdAt: string; author: PersonDTO } | "removed" | null;
  isShare: boolean;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** Up to three most-used reaction types on this post. */
  topReactions: ReactionType[];
  myReaction: ReactionType | null;
  saved: boolean;
  poll: {
    options: { id: string; label: string; votes: number }[];
    totalVotes: number;
    myOptionId: string | null;
    closed: boolean;
  } | null;
  acceptedCommentId: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * Posts the viewer is allowed to see: not hidden (unless their own), by an
 * account in good standing, and not from a private profile they don't follow.
 */
export function visiblePostWhere(viewer: Viewer): Prisma.CommunityPostWhereInput {
  const staff = isCommunityStaff(viewer.role);
  return {
    AND: [
      staff ? {} : { OR: [{ isHidden: false }, { authorId: viewer.id }] },
      { author: { isActive: true, isSuspended: false } },
      staff
        ? {}
        : {
            OR: [
              { authorId: viewer.id },
              { author: { communityPrivate: false } },
              { author: { communityFollowers: { some: { followerId: viewer.id } } } },
            ],
          },
    ],
  };
}

const postInclude = (viewerId: string) =>
  ({
    author: { select: AUTHOR_SELECT },
    group: { select: { id: true, slug: true, name: true } },
    sharedPost: {
      select: {
        id: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        isHidden: true,
        author: { select: { ...AUTHOR_SELECT, isActive: true, isSuspended: true, communityPrivate: true } },
      },
    },
    pollOptions: { orderBy: { order: "asc" }, select: { id: true, label: true, _count: { select: { votes: true } } } },
    reactions: { where: { userId: viewerId }, select: { type: true }, take: 1 },
    pollVotes: { where: { userId: viewerId }, select: { optionId: true }, take: 1 },
    savedBy: { where: { userId: viewerId }, select: { id: true }, take: 1 },
    _count: {
      select: { reactions: true, comments: { where: { isHidden: false } }, shares: { where: { isHidden: false } } },
    },
  }) satisfies Prisma.CommunityPostInclude;

type PostRow = Prisma.CommunityPostGetPayload<{ include: ReturnType<typeof postInclude> }>;

async function toPostDTOs(rows: PostRow[], viewer: Viewer): Promise<PostDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => Boolean(g)))];

  // Two bounded lookups for the whole page instead of one per post.
  const [reactionGroups, memberships] = await Promise.all([
    db.communityReaction.groupBy({ by: ["postId", "type"], where: { postId: { in: ids } }, _count: { _all: true } }),
    groupIds.length
      ? db.communityGroupMember.findMany({
          where: { userId: viewer.id, groupId: { in: groupIds } },
          select: { groupId: true, role: true },
        })
      : Promise.resolve([]),
  ]);
  const topByPost = new Map<string, ReactionType[]>();
  for (const id of ids) {
    topByPost.set(
      id,
      reactionGroups
        .filter((g) => g.postId === id)
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 3)
        .map((g) => g.type as ReactionType)
    );
  }
  const roleByGroup = new Map(memberships.map((m) => [m.groupId, m.role]));
  const now = Date.now();

  return rows.map((row) => {
    const original = row.sharedPost;
    const originalVisible =
      original &&
      !original.isHidden &&
      original.author.isActive &&
      !original.author.isSuspended &&
      (!original.author.communityPrivate || original.author.id === viewer.id);
    const totalVotes = row.pollOptions.reduce((sum, o) => sum + o._count.votes, 0);
    return {
      id: row.id,
      kind: row.kind,
      content: row.content,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt.toISOString(),
      edited: Boolean(row.editedAt),
      isHidden: row.isHidden,
      author: toPerson(row.author),
      group: row.group ? { slug: row.group.slug, name: row.group.name } : null,
      isShare: Boolean(row.sharedPostId) || (row.kind === "POST" && !row.content && !row.imageUrl),
      shared: originalVisible
        ? {
            id: original.id,
            content: original.content,
            imageUrl: original.imageUrl,
            createdAt: original.createdAt.toISOString(),
            author: toPerson(original.author),
          }
        : row.sharedPostId || (!row.content && !row.imageUrl && row.kind === "POST")
          ? "removed"
          : null,
      reactionCount: row._count.reactions,
      commentCount: row._count.comments,
      shareCount: row._count.shares,
      topReactions: topByPost.get(row.id) ?? [],
      myReaction: (row.reactions[0]?.type as ReactionType | undefined) ?? null,
      saved: row.savedBy.length > 0,
      poll:
        row.kind === "POLL"
          ? {
              options: row.pollOptions.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes })),
              totalVotes,
              myOptionId: row.pollVotes[0]?.optionId ?? null,
              closed: Boolean(row.pollClosesAt && row.pollClosesAt.getTime() < now),
            }
          : null,
      acceptedCommentId: row.acceptedCommentId,
      canEdit: row.authorId === viewer.id,
      canDelete: canDeleteContent({
        viewerId: viewer.id,
        viewerRole: viewer.role,
        authorId: row.authorId,
        inGroup: Boolean(row.groupId),
        groupMembership: row.groupId ? roleByGroup.get(row.groupId) : null,
      }),
    };
  });
}

export type FeedScope =
  | { type: "all" }
  | { type: "following" }
  | { type: "questions" }
  | { type: "trending" }
  | { type: "saved" }
  | { type: "profile"; userId: string }
  | { type: "group"; groupId: string }
  | { type: "search"; query: string };

export type FeedPage = { posts: PostDTO[]; nextCursor: string | null };

const TRENDING_WINDOW_DAYS = 14;
const TRENDING_MAX = 40;

/**
 * One page of posts for a scope. Chronological scopes page by a
 * (createdAt, id) cursor; "trending" ranks the last two weeks by reactions
 * then comments and pages by offset, capped so it can't walk the table.
 */
/** The filters for a scope, on top of what the viewer may see. */
function scopeWhere(viewer: Viewer, scope: FeedScope): Prisma.CommunityPostWhereInput[] {
  const where: Prisma.CommunityPostWhereInput[] = [visiblePostWhere(viewer)];

  if (scope.type === "following") {
    where.push({
      OR: [
        { authorId: viewer.id },
        { author: { communityFollowers: { some: { followerId: viewer.id } } } },
        { group: { members: { some: { userId: viewer.id } } } },
      ],
    });
  } else if (scope.type === "questions") {
    where.push({ kind: "QUESTION" });
  } else if (scope.type === "saved") {
    where.push({ savedBy: { some: { userId: viewer.id } } });
  } else if (scope.type === "profile") {
    where.push({ authorId: scope.userId });
  } else if (scope.type === "group") {
    where.push({ groupId: scope.groupId });
  } else if (scope.type === "search") {
    where.push({ content: { contains: scope.query.slice(0, 80), mode: "insensitive" } });
  }
  return where;
}

export async function getFeedPage(viewer: Viewer, scope: FeedScope, cursor?: string | null): Promise<FeedPage> {
  const where = scopeWhere(viewer, scope);

  if (scope.type === "trending") {
    const offset = Math.min(Math.max(Number.parseInt(cursor ?? "0", 10) || 0, 0), TRENDING_MAX);
    const rows = await db.communityPost.findMany({
      where: {
        AND: [...where, { createdAt: { gte: new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000) } }],
      },
      orderBy: [{ reactions: { _count: "desc" } }, { comments: { _count: "desc" } }, { createdAt: "desc" }],
      skip: offset,
      take: FEED_PAGE_SIZE + 1,
      include: postInclude(viewer.id),
    });
    const page = rows.slice(0, FEED_PAGE_SIZE);
    const next = offset + FEED_PAGE_SIZE;
    return {
      posts: await toPostDTOs(page, viewer),
      nextCursor: rows.length > FEED_PAGE_SIZE && next < TRENDING_MAX ? String(next) : null,
    };
  }

  const after = decodeCursor(cursor);
  if (after) {
    where.push({
      OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
    });
  }
  const rows = await db.communityPost.findMany({
    where: { AND: where },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE_SIZE + 1,
    include: postInclude(viewer.id),
  });
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    posts: await toPostDTOs(page, viewer),
    nextCursor: rows.length > FEED_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/** One post the viewer may see, or null. */
export async function getPost(viewer: Viewer, postId: string): Promise<PostDTO | null> {
  const row = await db.communityPost.findFirst({
    where: { AND: [{ id: postId }, visiblePostWhere(viewer)] },
    include: postInclude(viewer.id),
  });
  if (!row) return null;
  return (await toPostDTOs([row], viewer))[0] ?? null;
}

/**
 * Id of the newest post in a chronological scope, for the "new posts" pill:
 * one indexed row, no counts or relations.
 */
export async function newestPostId(viewer: Viewer, scope: FeedScope): Promise<string | null> {
  if (scope.type === "trending" || scope.type === "saved" || scope.type === "search") return null;
  const row = await db.communityPost.findFirst({
    where: { AND: scopeWhere(viewer, scope) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return row?.id ?? null;
}

export type ReactorDTO = PersonDTO & { type: ReactionType };

/** Who reacted to a post the viewer may see (newest first, bounded), or null. */
export async function getReactors(viewer: Viewer, postId: string): Promise<ReactorDTO[] | null> {
  const post = await db.communityPost.findFirst({
    where: { AND: [{ id: postId }, visiblePostWhere(viewer)] },
    select: { id: true },
  });
  if (!post) return null;
  const rows = await db.communityReaction.findMany({
    where: { postId: post.id, user: { isActive: true, isSuspended: false } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { type: true, user: { select: AUTHOR_SELECT } },
  });
  return rows.map((r) => ({ ...toPerson(r.user), type: r.type as ReactionType }));
}

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------

export type CommentDTO = {
  id: string;
  content: string;
  createdAt: string;
  edited: boolean;
  author: PersonDTO;
  canEdit: boolean;
  canDelete: boolean;
  likeCount: number;
  liked: boolean;
  replies: Omit<CommentDTO, "replies">[];
};

const REPLIES_PER_COMMENT = 20;

/** Top-level comments (oldest first) with their replies, for a post the caller already checked. */
export async function getComments(
  viewer: Viewer,
  post: { id: string; groupId: string | null },
  cursor?: string | null
): Promise<{ comments: CommentDTO[]; nextCursor: string | null }> {
  const staff = isCommunityStaff(viewer.role);
  const visible: Prisma.CommunityCommentWhereInput = {
    author: { isActive: true, isSuspended: false },
    ...(staff ? {} : { OR: [{ isHidden: false }, { authorId: viewer.id }] }),
  };
  const after = decodeCursor(cursor);
  const likeInclude = {
    author: { select: AUTHOR_SELECT },
    likes: { where: { userId: viewer.id }, select: { id: true }, take: 1 },
    _count: { select: { likes: true } },
  } satisfies Prisma.CommunityCommentInclude;
  const [rows, membership] = await Promise.all([
    db.communityComment.findMany({
      where: {
        AND: [
          { postId: post.id, parentId: null },
          visible,
          after
            ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }
            : {},
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: COMMENTS_PAGE_SIZE + 1,
      include: {
        ...likeInclude,
        replies: {
          where: visible,
          orderBy: { createdAt: "asc" },
          take: REPLIES_PER_COMMENT,
          include: likeInclude,
        },
      },
    }),
    post.groupId
      ? db.communityGroupMember.findUnique({
          where: { groupId_userId: { groupId: post.groupId, userId: viewer.id } },
          select: { role: true },
        })
      : null,
  ]);

  const shape = (c: {
    id: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
    authorId: string;
    author: AuthorRow;
    likes: { id: string }[];
    _count: { likes: number };
  }) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    edited: Boolean(c.editedAt),
    author: toPerson(c.author),
    canEdit: c.authorId === viewer.id,
    canDelete: canDeleteContent({
      viewerId: viewer.id,
      viewerRole: viewer.role,
      authorId: c.authorId,
      inGroup: Boolean(post.groupId),
      groupMembership: membership?.role,
    }),
    likeCount: c._count.likes,
    liked: c.likes.length > 0,
  });

  const page = rows.slice(0, COMMENTS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    comments: page.map((c) => ({ ...shape(c), replies: c.replies.map(shape) })),
    nextCursor: rows.length > COMMENTS_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

// ---------------------------------------------------------------------
// People
// ---------------------------------------------------------------------

export type ProfileDTO = PersonDTO & {
  bio: string | null;
  joinedAt: string;
  isPrivate: boolean;
  isSelf: boolean;
  isFollowing: boolean;
  followsViewer: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  level: number;
  xp: number;
  streak: number;
  achievements: { key: string; name: string; iconKey: string }[];
  canSeePosts: boolean;
};

/** A person's public community profile, or null if there is no such active account. */
export async function getProfile(viewer: Viewer, userId: string): Promise<ProfileDTO | null> {
  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, isSuspended: false },
    select: {
      ...AUTHOR_SELECT,
      bio: true,
      createdAt: true,
      communityPrivate: true,
      heroStats: { select: { xp: true, level: true, currentStreak: true } },
      achievements: {
        orderBy: { unlockedAt: "desc" },
        take: 6,
        select: { achievement: { select: { key: true, name: true, iconKey: true } } },
      },
      _count: { select: { communityFollowers: true, communityFollowing: true } },
    },
  });
  if (!user) return null;

  const [iFollow, followsMe] = await Promise.all([
    db.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: viewer.id, followingId: userId } },
      select: { id: true },
    }),
    db.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: viewer.id } },
      select: { id: true },
    }),
  ]);
  const canSeePosts = canSeeProfilePosts({
    viewerId: viewer.id,
    viewerRole: viewer.role,
    ownerId: userId,
    ownerIsPrivate: user.communityPrivate,
    viewerFollowsOwner: Boolean(iFollow),
  });
  const postCount = canSeePosts
    ? await db.communityPost.count({ where: { AND: [{ authorId: userId }, visiblePostWhere(viewer)] } })
    : 0;

  return {
    ...toPerson(user),
    bio: user.bio,
    joinedAt: user.createdAt.toISOString(),
    isPrivate: user.communityPrivate,
    isSelf: viewer.id === userId,
    isFollowing: Boolean(iFollow),
    followsViewer: Boolean(followsMe),
    followerCount: user._count.communityFollowers,
    followingCount: user._count.communityFollowing,
    postCount,
    // Derived from XP, the same way the HUD does, so the two always agree.
    level: xpProgressWithinLevel(user.heroStats?.xp ?? 0).level,
    xp: user.heroStats?.xp ?? 0,
    streak: user.heroStats?.currentStreak ?? 0,
    achievements: user.achievements.map((a) => a.achievement),
    canSeePosts,
  };
}

export type PersonCardDTO = PersonDTO & { isFollowing: boolean; followerCount: number };

/** People matching a search, or (no query) active people the viewer doesn't follow yet. */
export async function findPeople(viewer: Viewer, query: string | null, take = 12): Promise<PersonCardDTO[]> {
  const q = query?.trim().slice(0, 60);
  const rows = await db.user.findMany({
    where: {
      id: { not: viewer.id },
      isActive: true,
      isSuspended: false,
      profileCompleted: true,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { headline: { contains: q, mode: "insensitive" } },
            ],
          }
        : { communityPrivate: false, communityFollowers: { none: { followerId: viewer.id } } }),
    },
    orderBy: q ? [{ firstName: "asc" }] : [{ communityPosts: { _count: "desc" } }, { createdAt: "desc" }],
    take: Math.min(take, 30),
    select: {
      ...AUTHOR_SELECT,
      communityFollowers: { where: { followerId: viewer.id }, select: { id: true }, take: 1 },
      _count: { select: { communityFollowers: true } },
    },
  });
  return rows.map((u) => ({
    ...toPerson(u),
    isFollowing: u.communityFollowers.length > 0,
    followerCount: u._count.communityFollowers,
  }));
}

/** Followers of, or people followed by, a person (bounded). */
export async function getConnections(
  viewer: Viewer,
  userId: string,
  kind: "followers" | "following"
): Promise<PersonCardDTO[]> {
  const rows = await db.communityFollow.findMany({
    where: kind === "followers" ? { followingId: userId } : { followerId: userId },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      follower: kind === "followers" ? { select: AUTHOR_SELECT } : false,
      following: kind === "following" ? { select: AUTHOR_SELECT } : false,
    },
  });
  const people = rows
    .map((r) => (kind === "followers" ? r.follower : r.following) as AuthorRow | null)
    .filter((p): p is AuthorRow => Boolean(p));
  if (people.length === 0) return [];
  const [mine, counts] = await Promise.all([
    db.communityFollow.findMany({
      where: { followerId: viewer.id, followingId: { in: people.map((p) => p.id) } },
      select: { followingId: true },
    }),
    db.communityFollow.groupBy({
      by: ["followingId"],
      where: { followingId: { in: people.map((p) => p.id) } },
      _count: { _all: true },
    }),
  ]);
  const following = new Set(mine.map((m) => m.followingId));
  const countBy = new Map(counts.map((c) => [c.followingId, c._count._all]));
  return people.map((p) => ({ ...toPerson(p), isFollowing: following.has(p.id), followerCount: countBy.get(p.id) ?? 0 }));
}

// ---------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------

export type GroupDTO = {
  id: string;
  slug: string;
  name: string;
  topic: string;
  description: string;
  memberCount: number;
  postCount: number;
  myRole: "OWNER" | "MODERATOR" | "MEMBER" | null;
  owner: PersonDTO;
};

const groupSelect = (viewerId: string) =>
  ({
    id: true,
    slug: true,
    name: true,
    topic: true,
    description: true,
    owner: { select: AUTHOR_SELECT },
    members: { where: { userId: viewerId }, select: { role: true }, take: 1 },
    _count: { select: { members: true, posts: { where: { isHidden: false } } } },
  }) satisfies Prisma.CommunityGroupSelect;

type GroupRow = Prisma.CommunityGroupGetPayload<{ select: ReturnType<typeof groupSelect> }>;

const toGroup = (g: GroupRow): GroupDTO => ({
  id: g.id,
  slug: g.slug,
  name: g.name,
  topic: g.topic,
  description: g.description,
  memberCount: g._count.members,
  postCount: g._count.posts,
  myRole: g.members[0]?.role ?? null,
  owner: toPerson(g.owner),
});

export async function listGroups(
  viewer: Viewer,
  opts: { query?: string | null; topic?: string | null; mine?: boolean; take?: number } = {}
): Promise<GroupDTO[]> {
  const q = opts.query?.trim().slice(0, 60);
  const rows = await db.communityGroup.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { topic: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(opts.topic ? { topic: { equals: opts.topic, mode: "insensitive" } } : {}),
      ...(opts.mine ? { members: { some: { userId: viewer.id } } } : {}),
    },
    orderBy: [{ members: { _count: "desc" } }, { createdAt: "desc" }],
    take: Math.min(opts.take ?? 30, 60),
    select: groupSelect(viewer.id),
  });
  return rows.map(toGroup);
}

export async function getGroup(viewer: Viewer, slug: string): Promise<GroupDTO | null> {
  const row = await db.communityGroup.findUnique({ where: { slug }, select: groupSelect(viewer.id) });
  return row ? toGroup(row) : null;
}

export async function listGroupTopics(): Promise<string[]> {
  const rows = await db.communityGroup.groupBy({
    by: ["topic"],
    _count: { _all: true },
    orderBy: { _count: { topic: "desc" } },
    take: 12,
  });
  return rows.map((r) => r.topic);
}

export type GroupMemberDTO = PersonDTO & { role: "OWNER" | "MODERATOR" | "MEMBER" };

export async function listGroupMembers(groupId: string): Promise<GroupMemberDTO[]> {
  const rows = await db.communityGroupMember.findMany({
    where: { groupId, user: { isActive: true, isSuspended: false } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    take: 60,
    select: { role: true, user: { select: AUTHOR_SELECT } },
  });
  return rows.map((r) => ({ ...toPerson(r.user), role: r.role }));
}

// ---------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------

export type TrendingItem = { id: string; excerpt: string; kind: PostDTO["kind"]; reactions: number; comments: number };

export async function getSidebar(viewer: Viewer) {
  const [groups, trendingRows, people] = await Promise.all([
    listGroups(viewer, { take: 4 }),
    db.communityPost.findMany({
      where: {
        AND: [
          visiblePostWhere(viewer),
          { createdAt: { gte: new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000) } },
          { content: { not: "" } },
        ],
      },
      orderBy: [{ reactions: { _count: "desc" } }, { comments: { _count: "desc" } }, { createdAt: "desc" }],
      take: 4,
      select: {
        id: true,
        kind: true,
        content: true,
        _count: { select: { reactions: true, comments: { where: { isHidden: false } } } },
      },
    }),
    findPeople(viewer, null, 4),
  ]);
  const trending: TrendingItem[] = trendingRows
    // "Trending" with nothing on it isn't: only posts people responded to.
    .filter((p) => p._count.reactions + p._count.comments > 0)
    .map((p) => ({
    id: p.id,
    kind: p.kind,
    excerpt: p.content.length > 90 ? `${p.content.slice(0, 90)}…` : p.content,
    reactions: p._count.reactions,
      comments: p._count.comments,
    }));
  return { groups, trending, people };
}

// ---------------------------------------------------------------------
// Messages. Every function takes the viewer's id and only ever returns
// conversations that id is one side of.
// ---------------------------------------------------------------------

export type ConversationDTO = {
  id: string;
  other: PersonDTO;
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null;
  unread: number;
};

export async function listConversations(viewerId: string): Promise<ConversationDTO[]> {
  const rows = await db.conversation.findMany({
    where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
    orderBy: { lastMessageAt: "desc" },
    take: 40,
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userALastReadAt: true,
      userBLastReadAt: true,
      userA: { select: AUTHOR_SELECT },
      userB: { select: AUTHOR_SELECT },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true, createdAt: true } },
    },
  });
  const unread = await Promise.all(
    rows.map((c) =>
      db.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: viewerId },
          createdAt: { gt: c.userAId === viewerId ? c.userALastReadAt : c.userBLastReadAt },
        },
      })
    )
  );
  return rows
    .filter((c) => c.messages.length > 0)
    .map((c) => {
      const last = c.messages[0]!;
      return {
        id: c.id,
        other: toPerson(c.userAId === viewerId ? c.userB : c.userA),
        lastMessage: {
          body: last.body.length > 80 ? `${last.body.slice(0, 80)}…` : last.body,
          fromMe: last.senderId === viewerId,
          createdAt: last.createdAt.toISOString(),
        },
        unread: unread[rows.indexOf(c)] ?? 0,
      };
    });
}

/** How many conversations have something new for the viewer. */
export async function countUnreadConversations(viewerId: string): Promise<number> {
  const rows = await db.conversation.findMany({
    where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
    orderBy: { lastMessageAt: "desc" },
    take: 40,
    select: { id: true, userAId: true, userALastReadAt: true, userBLastReadAt: true, lastMessageAt: true },
  });
  const candidates = rows.filter(
    (c) => c.lastMessageAt > (c.userAId === viewerId ? c.userALastReadAt : c.userBLastReadAt)
  );
  if (candidates.length === 0) return 0;
  const counts = await Promise.all(
    candidates.map((c) =>
      db.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: viewerId },
          createdAt: { gt: c.userAId === viewerId ? c.userALastReadAt : c.userBLastReadAt },
        },
        take: 1,
      })
    )
  );
  return counts.filter((n) => n > 0).length;
}

export type MessageDTO = { id: string; body: string; fromMe: boolean; createdAt: string };

/**
 * A conversation's newest messages (or the page before `before`), oldest
 * first. Returns null when the viewer is not one of its two people.
 */
export async function getConversation(
  viewerId: string,
  conversationId: string,
  before?: string | null
): Promise<{ id: string; other: PersonDTO; messages: MessageDTO[]; hasMore: boolean } | null> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userAId: true, userBId: true, userA: { select: AUTHOR_SELECT }, userB: { select: AUTHOR_SELECT } },
  });
  if (!conversation || !conversationSide(conversation, viewerId)) return null;

  const cursor = decodeCursor(before);
  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGES_PAGE_SIZE + 1,
    select: { id: true, body: true, senderId: true, createdAt: true },
  });
  const page = rows.slice(0, MESSAGES_PAGE_SIZE).reverse();
  return {
    id: conversation.id,
    other: toPerson(conversation.userAId === viewerId ? conversation.userB : conversation.userA),
    messages: page.map((m) => ({
      id: m.id,
      body: m.body,
      fromMe: m.senderId === viewerId,
      createdAt: m.createdAt.toISOString(),
    })),
    hasMore: rows.length > MESSAGES_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------
// Helpful heroes: who had the most answers marked useful recently.
// Counted from what askers chose, so it can't be raised by posting more.
// ---------------------------------------------------------------------

export type HelperDTO = PersonDTO & { usefulAnswers: number };

export async function getTopHelpers(take = 5): Promise<HelperDTO[]> {
  const rows = await db.communityPost.findMany({
    where: {
      kind: "QUESTION",
      acceptedCommentId: { not: null },
      isHidden: false,
      updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      authorId: true,
      acceptedComment: {
        select: { authorId: true, author: { select: { ...AUTHOR_SELECT, isActive: true, isSuspended: true } } },
      },
    },
  });
  const tally = new Map<string, HelperDTO>();
  for (const row of rows) {
    const answer = row.acceptedComment;
    // An answer to your own question never counts.
    if (!answer || answer.authorId === row.authorId || !answer.author.isActive || answer.author.isSuspended) continue;
    const entry = tally.get(answer.authorId) ?? { ...toPerson(answer.author), usefulAnswers: 0 };
    entry.usefulAnswers++;
    tally.set(answer.authorId, entry);
  }
  return [...tally.values()].sort((a, b) => b.usefulAnswers - a.usefulAnswers).slice(0, take);
}
