"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { displayName, isCommunityStaff, messageInputSchema } from "@/lib/community/rules";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import {
  GROUP_CHAT_MAX_MEMBERS,
  GROUP_CHAT_NAME_MAX,
  groupChatCandidates,
  groupChatMembers,
  groupChatMembership,
  groupChatMessages,
  listChats,
  type ChatMessageDTO,
  type ChatSummaryDTO,
  type GroupChatMemberDTO,
} from "@/server/services/chats";
import type { PersonDTO } from "@/server/services/community";
import { requireActiveUser } from "./require-user";

// ---------------------------------------------------------------------
// Group chats. Every action takes the acting user from the session and
// re-checks that they are in the chat (and an admin, where it matters); a
// chat id alone is never enough. Errors are RETURNED so they reach the user.
// ---------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const NOT_AVAILABLE = "That chat isn't available.";
const PAUSED = "The Community is paused for a moment. Please try again shortly.";

type Actor = { id: string; role: string; firstName: string; lastName: string };

const paused = async (user: Actor) => !(await isFeatureEnabled("community", { userId: user.id, role: user.role }));

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= GROUP_CHAT_NAME_MAX ? name : null;
}

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 40))].slice(0, GROUP_CHAT_MAX_MEMBERS);
}

/**
 * Of `ids`, the people `actor` may add to a chat: active accounts that
 * follow them or that they follow, and mentors. Staff may add anyone.
 * Same idea as direct messages: nobody is pulled into a chat by a stranger.
 */
async function addable(actor: Actor, ids: string[]): Promise<{ id: string; firstName: string; lastName: string }[]> {
  if (ids.length === 0) return [];
  return db.user.findMany({
    where: {
      id: { in: ids.filter((id) => id !== actor.id) },
      isActive: true,
      isSuspended: false,
      ...(isCommunityStaff(actor.role)
        ? {}
        : {
            OR: [
              { communityFollowing: { some: { followingId: actor.id } } },
              { communityFollowers: { some: { followerId: actor.id } } },
              { role: { not: "STUDENT" } },
            ],
          }),
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

const nameList = (people: { firstName: string; lastName: string }[]) => {
  const names = people.map((p) => displayName(p));
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
};

async function systemLine(chatId: string, body: string) {
  const now = new Date();
  await db.$transaction([
    db.groupChatMessage.create({ data: { chatId, body, isSystem: true, createdAt: now } }),
    db.groupChat.update({ where: { id: chatId }, data: { lastMessageAt: now } }),
  ]);
}

function revalidateChat(chatId?: string) {
  revalidatePath("/community/messages", "layout");
  if (chatId) revalidatePath(`/community/messages/g/${chatId}`);
}

// ---------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------

/** The inbox, for the chat list to refresh itself while open. */
export async function loadChats(): Promise<Result<{ chats: ChatSummaryDTO[] }>> {
  const user = await requireActiveUser();
  return { ok: true, chats: await listChats(user.id) };
}

/** People the user may add to a new chat (or to `chatId`), matching a search. */
export async function searchChatPeople(query: unknown, chatId?: unknown): Promise<Result<{ people: PersonDTO[] }>> {
  const user = await requireActiveUser();
  const { success } = await checkRateLimit("api", `community:chat-search:${user.id}`);
  if (!success) return fail("Slow down a little and try again.");
  const people = await groupChatCandidates(
    user.id,
    typeof query === "string" ? query : null,
    typeof chatId === "string" && chatId ? chatId : undefined
  );
  return { ok: true, people };
}

// ---------------------------------------------------------------------
// Creating and running a group chat
// ---------------------------------------------------------------------

export async function createGroupChat(input: { name?: unknown; memberIds?: unknown }): Promise<Result<{ chatId: string }>> {
  const user = await requireActiveUser();
  if (await paused(user)) return fail(PAUSED);
  const name = cleanName(input?.name);
  if (!name) return fail(`Give the group a name (up to ${GROUP_CHAT_NAME_MAX} characters).`);
  const ids = cleanIds(input?.memberIds);
  if (ids.length < 2) return fail("Pick at least two people for a group chat.");
  if (ids.length > GROUP_CHAT_MAX_MEMBERS - 1) return fail(`A group chat can have up to ${GROUP_CHAT_MAX_MEMBERS} people.`);

  const { success } = await checkRateLimit("strict", `community:new-group-chat:${user.id}`);
  if (!success) return fail("You're creating chats quickly. Give it a minute.");

  const people = await addable(user, ids);
  if (people.length < ids.length) {
    return fail("You can only add people who follow you, people you follow, and mentors.");
  }

  const now = new Date();
  const chat = await db.groupChat.create({
    data: {
      name,
      createdById: user.id,
      lastMessageAt: now,
      members: {
        create: [{ userId: user.id, role: "ADMIN", lastReadAt: now }, ...people.map((p) => ({ userId: p.id }))],
      },
      messages: { create: { body: `${displayName(user)} created the group "${name}"`, isSystem: true, createdAt: now } },
    },
    select: { id: true },
  });
  revalidateChat();
  return { ok: true, chatId: chat.id };
}

export async function sendGroupMessage(chatId: unknown, body: unknown): Promise<Result<{ message: ChatMessageDTO }>> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string") return fail(NOT_AVAILABLE);
  if (await paused(user)) return fail(PAUSED);
  const { success } = await checkRateLimit("write", `community:message:${user.id}`);
  if (!success) return fail("You're sending messages quickly. Give it a moment.");
  const parsed = messageInputSchema.safeParse({ body });
  if (!parsed.success) return fail("Write a message first (up to 2000 characters).");

  const chat = await db.groupChat.findUnique({ where: { id: chatId }, select: { id: true, name: true } });
  const me = chat ? await groupChatMembership(user.id, chatId) : null;
  if (!chat || !me) return fail(NOT_AVAILABLE);

  const now = new Date();
  const [message] = await db.$transaction([
    db.groupChatMessage.create({
      data: { chatId, senderId: user.id, body: parsed.data.body, createdAt: now },
      select: { id: true, body: true, createdAt: true },
    }),
    db.groupChat.update({ where: { id: chatId }, data: { lastMessageAt: now } }),
    db.groupChatMember.update({ where: { chatId_userId: { chatId, userId: user.id } }, data: { lastReadAt: now } }),
  ]);
  await notifyGroup({ chatId, chatName: chat.name, senderId: user.id, senderName: displayName(user), body: parsed.data.body });
  return {
    ok: true,
    message: {
      id: message.id,
      body: message.body,
      fromMe: true,
      isSystem: false,
      createdAt: message.createdAt.toISOString(),
      sender: { id: user.id, name: displayName(user), avatarUrl: user.avatarUrl ?? null },
    },
  };
}

/**
 * The chat's newest messages and who has read how far, and marks it read
 * for the caller. The chat screen polls this while it is open and visible.
 */
export async function pollGroupChat(
  chatId: unknown
): Promise<Result<{ messages: ChatMessageDTO[]; hasMore: boolean; members: GroupChatMemberDTO[]; name: string; myRole: "ADMIN" | "MEMBER" }>> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string") return fail(NOT_AVAILABLE);
  const [chat, me] = await Promise.all([
    db.groupChat.findUnique({ where: { id: chatId }, select: { name: true } }),
    groupChatMembership(user.id, chatId),
  ]);
  if (!chat || !me) return fail(NOT_AVAILABLE);
  await markGroupRead(chatId, user.id);
  const [page, members] = await Promise.all([groupChatMessages(user.id, chatId), groupChatMembers(chatId)]);
  return { ok: true, ...page, members, name: chat.name, myRole: me.role };
}

export async function loadOlderGroupMessages(chatId: unknown, before: unknown): Promise<Result<{ messages: ChatMessageDTO[]; hasMore: boolean }>> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string" || typeof before !== "string") return fail(NOT_AVAILABLE);
  if (!(await groupChatMembership(user.id, chatId))) return fail(NOT_AVAILABLE);
  return { ok: true, ...(await groupChatMessages(user.id, chatId, before)) };
}

/** Any member can add people they could start a chat with. */
export async function addGroupChatMembers(chatId: unknown, memberIds: unknown): Promise<Result<{ added: number }>> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string") return fail(NOT_AVAILABLE);
  if (await paused(user)) return fail(PAUSED);
  if (!(await groupChatMembership(user.id, chatId))) return fail(NOT_AVAILABLE);
  const ids = cleanIds(memberIds);
  if (ids.length === 0) return fail("Pick someone to add.");
  const { success } = await checkRateLimit("api", `community:chat-add:${user.id}`);
  if (!success) return fail("Slow down a little and try again.");

  const people = await addable(user, ids);
  if (people.length < ids.length) return fail("You can only add people who follow you, people you follow, and mentors.");
  const current = await db.groupChatMember.count({ where: { chatId } });
  if (current + people.length > GROUP_CHAT_MAX_MEMBERS) return fail(`A group chat can have up to ${GROUP_CHAT_MAX_MEMBERS} people.`);

  const { count } = await db.groupChatMember.createMany({
    data: people.map((p) => ({ chatId, userId: p.id })),
    skipDuplicates: true,
  });
  if (count > 0) await systemLine(chatId, `${displayName(user)} added ${nameList(people)}`);
  revalidateChat(chatId);
  return { ok: true, added: count };
}

/** Admins can remove someone (and site staff can remove anyone). */
export async function removeGroupChatMember(chatId: unknown, userId: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string" || typeof userId !== "string") return fail(NOT_AVAILABLE);
  if (userId === user.id) return leaveGroupChat(chatId);
  const me = await groupChatMembership(user.id, chatId);
  if (!me) return fail(NOT_AVAILABLE);
  if (me.role !== "ADMIN" && !isCommunityStaff(user.role)) return fail("Only the group's admins can remove people.");
  const target = await db.groupChatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { id: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!target) return fail("They're not in this chat.");
  await db.groupChatMember.delete({ where: { id: target.id } });
  await systemLine(chatId, `${displayName(user)} removed ${displayName(target.user)}`);
  revalidateChat(chatId);
  return { ok: true };
}

/**
 * Leaves a chat. If the last admin leaves, the longest-standing member
 * becomes admin; when nobody is left the chat is deleted.
 */
export async function leaveGroupChat(chatId: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string") return fail(NOT_AVAILABLE);
  const me = await groupChatMembership(user.id, chatId);
  if (!me) return fail(NOT_AVAILABLE);

  await db.groupChatMember.delete({ where: { chatId_userId: { chatId, userId: user.id } } });
  const left = await db.groupChatMember.findMany({
    where: { chatId },
    orderBy: { joinedAt: "asc" },
    select: { id: true, role: true },
  });
  if (left.length === 0) {
    await db.groupChat.delete({ where: { id: chatId } });
  } else {
    if (!left.some((m) => m.role === "ADMIN")) {
      await db.groupChatMember.update({ where: { id: left[0]!.id }, data: { role: "ADMIN" } });
    }
    await systemLine(chatId, `${displayName(user)} left the group`);
  }
  // Their unread notification for this chat goes too.
  await db.notification.updateMany({
    where: { userId: user.id, type: "COMMUNITY_MESSAGE", linkUrl: `/community/messages/g/${chatId}`, isRead: false },
    data: { isRead: true },
  });
  revalidateChat(chatId);
  return { ok: true };
}

export async function renameGroupChat(chatId: unknown, name: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string") return fail(NOT_AVAILABLE);
  const me = await groupChatMembership(user.id, chatId);
  if (!me) return fail(NOT_AVAILABLE);
  if (me.role !== "ADMIN") return fail("Only the group's admins can rename it.");
  const clean = cleanName(name);
  if (!clean) return fail(`Use a name of up to ${GROUP_CHAT_NAME_MAX} characters.`);
  const chat = await db.groupChat.findUnique({ where: { id: chatId }, select: { name: true } });
  if (!chat) return fail(NOT_AVAILABLE);
  if (chat.name === clean) return { ok: true };
  await db.groupChat.update({ where: { id: chatId }, data: { name: clean } });
  await systemLine(chatId, `${displayName(user)} named the group "${clean}"`);
  revalidateChat(chatId);
  return { ok: true };
}

/** Admins can make another member an admin, or take it away (there is always at least one). */
export async function setGroupChatAdmin(chatId: unknown, userId: unknown, admin: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (typeof chatId !== "string" || typeof userId !== "string") return fail(NOT_AVAILABLE);
  const me = await groupChatMembership(user.id, chatId);
  if (!me) return fail(NOT_AVAILABLE);
  if (me.role !== "ADMIN") return fail("Only the group's admins can do that.");
  const target = await db.groupChatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!target) return fail("They're not in this chat.");
  const makeAdmin = admin === true;
  if ((target.role === "ADMIN") === makeAdmin) return { ok: true };
  if (!makeAdmin && (await db.groupChatMember.count({ where: { chatId, role: "ADMIN" } })) <= 1) {
    return fail("A group needs at least one admin.");
  }
  await db.groupChatMember.update({ where: { id: target.id }, data: { role: makeAdmin ? "ADMIN" : "MEMBER" } });
  await systemLine(
    chatId,
    makeAdmin ? `${displayName(user)} made ${displayName(target.user)} an admin` : `${displayName(target.user)} is no longer an admin`
  );
  revalidateChat(chatId);
  return { ok: true };
}

// ---------------------------------------------------------------------

async function markGroupRead(chatId: string, userId: string) {
  await db.$transaction([
    db.groupChatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { lastReadAt: new Date() } }),
    db.notification.updateMany({
      where: { userId, type: "COMMUNITY_MESSAGE", linkUrl: `/community/messages/g/${chatId}`, isRead: false },
      data: { isRead: true },
    }),
  ]);
}

/**
 * Tells the other members a message arrived. One unread notification per
 * member per chat: further messages update it instead of stacking up.
 */
async function notifyGroup(input: { chatId: string; chatName: string; senderId: string; senderName: string; body: string }) {
  const linkUrl = `/community/messages/g/${input.chatId}`;
  const text = `${input.senderName.split(" ")[0]}: ${input.body}`;
  const data = { title: `New message in ${input.chatName}`, body: text.length > 140 ? `${text.slice(0, 140)}…` : text };
  try {
    const members = await db.groupChatMember.findMany({
      where: { chatId: input.chatId, userId: { not: input.senderId } },
      select: { userId: true },
    });
    if (members.length === 0) return;
    const ids = members.map((m) => m.userId);
    const unread = await db.notification.findMany({
      where: { userId: { in: ids }, type: "COMMUNITY_MESSAGE", linkUrl, isRead: false },
      select: { userId: true },
    });
    const has = new Set(unread.map((n) => n.userId));
    await db.$transaction([
      db.notification.updateMany({
        where: { userId: { in: [...has] }, type: "COMMUNITY_MESSAGE", linkUrl, isRead: false },
        data: { ...data, createdAt: new Date() },
      }),
      db.notification.createMany({
        data: ids.filter((id) => !has.has(id)).map((userId) => ({ userId, type: "COMMUNITY_MESSAGE" as const, linkUrl, ...data })),
      }),
    ]);
  } catch {
    // The message itself was sent; a failed notification must not undo that.
  }
}
