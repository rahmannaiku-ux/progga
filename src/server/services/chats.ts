import { db } from "@/lib/db/client";
import { MESSAGES_PAGE_SIZE, decodeCursor } from "@/lib/community/rules";
import { isMuted, mutedUntilIso, notMutedWhere } from "@/lib/community/chat-mute";
import { toPerson, type PersonDTO } from "@/server/services/community";

// ---------------------------------------------------------------------
// Chats — the Messages inbox. Direct conversations (Conversation, always
// two people) and group chats (GroupChat, up to GROUP_CHAT_MAX_MEMBERS)
// side by side. Every function takes the viewer's id and only returns
// chats that viewer is in.
// ---------------------------------------------------------------------

export const GROUP_CHAT_MAX_MEMBERS = 50;
export const GROUP_CHAT_NAME_MAX = 60;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarUrl: true,
  headline: true,
  role: true,
} as const;

/** One row of the inbox. `href` is where it opens. */
export type ChatSummaryDTO = {
  key: string;
  kind: "direct" | "group";
  id: string;
  href: string;
  title: string;
  /** Up to three faces: the other person, or the most recent group members. */
  faces: { name: string; avatarUrl: string | null }[];
  memberCount: number;
  lastMessage: { body: string; fromMe: boolean; senderName: string | null; createdAt: string } | null;
  lastActivityAt: string;
  unread: number;
  /** The viewer muted this chat (no notifications, not in the Chats badge). */
  muted: boolean;
};

const excerpt = (body: string) => (body.length > 80 ? `${body.slice(0, 80)}…` : body);
const firstName = (name: string) => name.split(" ")[0] ?? name;

/** The viewer's chats, direct and group, most recent first (bounded). */
export async function listChats(viewerId: string): Promise<ChatSummaryDTO[]> {
  const [direct, memberships] = await Promise.all([
    db.conversation.findMany({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      orderBy: { lastMessageAt: "desc" },
      take: 40,
      select: {
        id: true,
        userAId: true,
        userALastReadAt: true,
        userBLastReadAt: true,
        userAMutedUntil: true,
        userBMutedUntil: true,
        lastMessageAt: true,
        userA: { select: PERSON_SELECT },
        userB: { select: PERSON_SELECT },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true, createdAt: true } },
      },
    }),
    db.groupChatMember.findMany({
      where: { userId: viewerId },
      orderBy: { chat: { lastMessageAt: "desc" } },
      take: 40,
      select: {
        lastReadAt: true,
        mutedUntil: true,
        chat: {
          select: {
            id: true,
            name: true,
            lastMessageAt: true,
            _count: { select: { members: true } },
            members: {
              where: { userId: { not: viewerId } },
              orderBy: { joinedAt: "asc" },
              take: 3,
              select: { user: { select: PERSON_SELECT } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { body: true, senderId: true, isSystem: true, createdAt: true, sender: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    }),
  ]);

  const [directUnread, groupUnread] = await Promise.all([
    Promise.all(
      direct.map((c) => {
        const readAt = c.userAId === viewerId ? c.userALastReadAt : c.userBLastReadAt;
        return c.lastMessageAt > readAt
          ? db.message.count({ where: { conversationId: c.id, senderId: { not: viewerId }, createdAt: { gt: readAt } } })
          : 0;
      })
    ),
    Promise.all(
      memberships.map((m) =>
        m.chat.lastMessageAt > m.lastReadAt
          ? db.groupChatMessage.count({
              where: { chatId: m.chat.id, isSystem: false, senderId: { not: viewerId }, createdAt: { gt: m.lastReadAt } },
            })
          : 0
      )
    ),
  ]);

  const rows: ChatSummaryDTO[] = [];
  direct.forEach((c, i) => {
    const last = c.messages[0];
    if (!last) return; // opened but never used
    const other = toPerson(c.userAId === viewerId ? c.userB : c.userA);
    rows.push({
      key: `d:${c.id}`,
      kind: "direct",
      id: c.id,
      href: `/community/messages/${c.id}`,
      title: other.name,
      faces: [{ name: other.name, avatarUrl: other.avatarUrl }],
      memberCount: 2,
      lastMessage: { body: excerpt(last.body), fromMe: last.senderId === viewerId, senderName: null, createdAt: last.createdAt.toISOString() },
      lastActivityAt: last.createdAt.toISOString(),
      unread: directUnread[i] ?? 0,
      muted: isMuted(c.userAId === viewerId ? c.userAMutedUntil : c.userBMutedUntil),
    });
  });
  memberships.forEach((m, i) => {
    const c = m.chat;
    const last = c.messages[0];
    const faces = c.members.map(({ user }) => toPerson(user)).map((p) => ({ name: p.name, avatarUrl: p.avatarUrl }));
    const senderName = last?.sender ? firstName(`${last.sender.firstName} ${last.sender.lastName}`.trim() || "Someone") : null;
    rows.push({
      key: `g:${c.id}`,
      kind: "group",
      id: c.id,
      href: `/community/messages/g/${c.id}`,
      title: c.name,
      faces,
      memberCount: c._count.members,
      lastMessage: last
        ? {
            body: excerpt(last.body),
            fromMe: last.senderId === viewerId && !last.isSystem,
            senderName: last.isSystem ? null : senderName,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      lastActivityAt: (last?.createdAt ?? c.lastMessageAt).toISOString(),
      unread: groupUnread[i] ?? 0,
      muted: isMuted(m.mutedUntil),
    });
  });
  return rows.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, 60);
}

/** How many chats (direct or group) have something new for the viewer. Muted chats don't count. */
export async function countUnreadChats(viewerId: string): Promise<number> {
  const [direct, groups] = await Promise.all([
    db.conversation.findMany({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      orderBy: { lastMessageAt: "desc" },
      take: 40,
      select: {
        id: true,
        userAId: true,
        userALastReadAt: true,
        userBLastReadAt: true,
        userAMutedUntil: true,
        userBMutedUntil: true,
        lastMessageAt: true,
      },
    }),
    db.groupChatMember.findMany({
      where: { userId: viewerId, ...notMutedWhere() },
      orderBy: { chat: { lastMessageAt: "desc" } },
      take: 40,
      select: { chatId: true, lastReadAt: true, chat: { select: { lastMessageAt: true } } },
    }),
  ]);
  const counts = await Promise.all([
    ...direct.map((c) => {
      const readAt = c.userAId === viewerId ? c.userALastReadAt : c.userBLastReadAt;
      if (isMuted(c.userAId === viewerId ? c.userAMutedUntil : c.userBMutedUntil)) return 0;
      return c.lastMessageAt > readAt
        ? db.message.count({ where: { conversationId: c.id, senderId: { not: viewerId }, createdAt: { gt: readAt } }, take: 1 })
        : 0;
    }),
    ...groups.map((g) =>
      g.chat.lastMessageAt > g.lastReadAt
        ? db.groupChatMessage.count({
            where: { chatId: g.chatId, isSystem: false, senderId: { not: viewerId }, createdAt: { gt: g.lastReadAt } },
            take: 1,
          })
        : 0
    ),
  ]);
  return counts.filter((n) => n > 0).length;
}

// ---------------------------------------------------------------------
// One group chat
// ---------------------------------------------------------------------

export type ChatMessageDTO = {
  id: string;
  body: string;
  fromMe: boolean;
  createdAt: string;
  /** Who sent it (null on a system line). */
  sender: { id: string; name: string; avatarUrl: string | null } | null;
  isSystem: boolean;
};

export type GroupChatMemberDTO = PersonDTO & { role: "ADMIN" | "MEMBER"; lastReadAt: string };

export type GroupChatDTO = {
  id: string;
  name: string;
  myRole: "ADMIN" | "MEMBER";
  members: GroupChatMemberDTO[];
  messages: ChatMessageDTO[];
  hasMore: boolean;
  /** When the viewer's mute ends (ISO), or null. */
  mutedUntil: string | null;
};

/** The viewer's membership of a group chat, or null when they are not in it. */
export async function groupChatMembership(viewerId: string, chatId: string) {
  return db.groupChatMember.findUnique({
    where: { chatId_userId: { chatId, userId: viewerId } },
    select: { role: true, lastReadAt: true, mutedUntil: true },
  });
}

/** A page of a group chat's messages, oldest first (the newest page, or the one before `before`). */
export async function groupChatMessages(
  viewerId: string,
  chatId: string,
  before?: string | null
): Promise<{ messages: ChatMessageDTO[]; hasMore: boolean }> {
  const cursor = decodeCursor(before);
  const rows = await db.groupChatMessage.findMany({
    where: {
      chatId,
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGES_PAGE_SIZE + 1,
    select: { id: true, body: true, isSystem: true, createdAt: true, senderId: true, sender: { select: PERSON_SELECT } },
  });
  return {
    messages: rows
      .slice(0, MESSAGES_PAGE_SIZE)
      .reverse()
      .map((m) => {
        const sender = m.sender ? toPerson(m.sender) : null;
        return {
          id: m.id,
          body: m.body,
          isSystem: m.isSystem,
          fromMe: !m.isSystem && m.senderId === viewerId,
          createdAt: m.createdAt.toISOString(),
          sender: sender ? { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl } : null,
        };
      }),
    hasMore: rows.length > MESSAGES_PAGE_SIZE,
  };
}

/** Everyone in a group chat, admins first. */
export async function groupChatMembers(chatId: string): Promise<GroupChatMemberDTO[]> {
  const rows = await db.groupChatMember.findMany({
    where: { chatId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    take: GROUP_CHAT_MAX_MEMBERS,
    select: { role: true, lastReadAt: true, user: { select: PERSON_SELECT } },
  });
  return rows.map((r) => ({ ...toPerson(r.user), role: r.role, lastReadAt: r.lastReadAt.toISOString() }));
}

/** A group chat as its screen needs it, or null when the viewer is not a member. */
export async function getGroupChat(viewerId: string, chatId: string): Promise<GroupChatDTO | null> {
  const [chat, me] = await Promise.all([
    db.groupChat.findUnique({ where: { id: chatId }, select: { id: true, name: true } }),
    groupChatMembership(viewerId, chatId),
  ]);
  if (!chat || !me) return null;
  const [members, page] = await Promise.all([groupChatMembers(chatId), groupChatMessages(viewerId, chatId)]);
  return { id: chat.id, name: chat.name, myRole: me.role, members, ...page, mutedUntil: mutedUntilIso(me.mutedUntil) };
}

/** People the viewer may add to a group chat: those who follow them, people they follow, and mentors. */
export async function groupChatCandidates(viewerId: string, query: string | null, excludeChatId?: string, take = 20): Promise<PersonDTO[]> {
  const q = query?.trim().replace(/^@+/, "").slice(0, 60);
  const rows = await db.user.findMany({
    where: {
      id: { not: viewerId },
      isActive: true,
      isSuspended: false,
      profileCompleted: true,
      OR: [
        { communityFollowing: { some: { followingId: viewerId } } },
        { communityFollowers: { some: { followerId: viewerId } } },
        { role: { not: "STUDENT" } },
      ],
      ...(excludeChatId ? { groupChatMemberships: { none: { chatId: excludeChatId } } } : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { username: { contains: q.toLowerCase() } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ firstName: "asc" }],
    take: Math.min(take, 30),
    select: PERSON_SELECT,
  });
  return rows.map(toPerson);
}
