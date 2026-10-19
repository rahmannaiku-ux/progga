"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { conversationPair, conversationSide, displayName, messageInputSchema } from "@/lib/community/rules";
import { getConversation, type MessageDTO } from "@/server/services/community";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { requireActiveUser } from "./require-user";

// ---------------------------------------------------------------------
// Direct messages. Two people, plain text. Every action resolves the
// conversation from the signed-in user and refuses anything they are not
// one side of; a conversation id alone is never enough.
// ---------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Opens (creating if needed) the conversation with another person.
 * Messaging a stranger is allowed only when they follow you or you are
 * replying in a conversation they started: you can't open a chat with
 * someone who has shown no interest. Mentors and admins can always be
 * reached, and can reach anyone.
 */
export async function openConversation(otherUserId: string): Promise<Result<{ conversationId: string }>> {
  const user = await requireActiveUser();
  const otherId = String(otherUserId);
  if (otherId === user.id) return fail("You can't message yourself.");

  const other = await db.user.findFirst({
    where: { id: otherId, isActive: true, isSuspended: false },
    select: { id: true, role: true },
  });
  if (!other) return fail("That person isn't available.");

  const pair = conversationPair(user.id, otherId);
  const existing = await db.conversation.findUnique({ where: { userAId_userBId: pair }, select: { id: true } });
  if (existing) return { ok: true, conversationId: existing.id };

  const staffInvolved = user.role !== "STUDENT" || other.role !== "STUDENT";
  if (!staffInvolved) {
    const theyFollowMe = await db.communityFollow.findUnique({
      where: { followerId_followingId: { followerId: otherId, followingId: user.id } },
      select: { id: true },
    });
    if (!theyFollowMe) {
      return fail("You can message people who follow you. Follow them, and they can message you first.");
    }
  }

  const { success } = await checkRateLimit("strict", `community:new-chat:${user.id}`);
  if (!success) return fail("You're starting chats quickly. Give it a minute.");

  try {
    const created = await db.conversation.create({ data: pair, select: { id: true } });
    return { ok: true, conversationId: created.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await db.conversation.findUnique({ where: { userAId_userBId: pair }, select: { id: true } });
      if (raced) return { ok: true, conversationId: raced.id };
    }
    throw err;
  }
}

export async function sendMessage(conversationId: string, body: string): Promise<Result<{ message: MessageDTO }>> {
  const user = await requireActiveUser();
  if (!(await isFeatureEnabled("community", { userId: user.id, role: user.role }))) {
    return fail("The Community is paused for a moment. Please try again shortly.");
  }
  const { success } = await checkRateLimit("write", `community:message:${user.id}`);
  if (!success) return fail("You're sending messages quickly. Give it a moment.");

  const parsed = messageInputSchema.safeParse({ body });
  if (!parsed.success) return fail("Write a message first (up to 2000 characters).");

  const conversation = await db.conversation.findUnique({
    where: { id: String(conversationId) },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: { isActive: true, isSuspended: true } },
      userB: { select: { isActive: true, isSuspended: true } },
    },
  });
  const side = conversation ? conversationSide(conversation, user.id) : null;
  // Same answer whether it doesn't exist or isn't theirs.
  if (!conversation || !side) return fail("That conversation isn't available.");
  const other = side === "A" ? conversation.userB : conversation.userA;
  if (!other.isActive || other.isSuspended) return fail("This person can't receive messages right now.");

  const now = new Date();
  const [message] = await db.$transaction([
    db.message.create({
      data: { conversationId: conversation.id, senderId: user.id, body: parsed.data.body },
      select: { id: true, body: true, createdAt: true },
    }),
    db.conversation.update({
      where: { id: conversation.id },
      // Sending also means you've read up to now.
      data: { lastMessageAt: now, ...(side === "A" ? { userALastReadAt: now } : { userBLastReadAt: now }) },
    }),
  ]);
  await notifyNewMessage({
    recipientId: side === "A" ? conversation.userBId : conversation.userAId,
    senderName: displayName(user),
    conversationId: conversation.id,
    body: parsed.data.body,
  });
  revalidatePath("/community/messages");
  return {
    ok: true,
    message: { id: message.id, body: message.body, fromMe: true, createdAt: message.createdAt.toISOString() },
  };
}

/**
 * The conversation's latest messages, and marks it read for the caller.
 * The chat screen polls this while it is open and visible.
 */
export async function pollConversation(
  conversationId: string
): Promise<Result<{ messages: MessageDTO[]; hasMore: boolean; otherReadAt: string }>> {
  const user = await requireActiveUser();
  const conversation = await getConversation(user.id, String(conversationId));
  if (!conversation) return fail("That conversation isn't available.");
  await markRead(conversation.id, user.id);
  return { ok: true, messages: conversation.messages, hasMore: conversation.hasMore, otherReadAt: conversation.otherReadAt };
}

export async function loadOlderMessages(
  conversationId: string,
  before: string
): Promise<Result<{ messages: MessageDTO[]; hasMore: boolean }>> {
  const user = await requireActiveUser();
  const conversation = await getConversation(user.id, String(conversationId), String(before));
  if (!conversation) return fail("That conversation isn't available.");
  return { ok: true, messages: conversation.messages, hasMore: conversation.hasMore };
}

/**
 * Tells the other person a message arrived, through the normal
 * notifications (bell, /notifications and the pop-up). One unread
 * notification per conversation: further messages before they look update
 * that one instead of stacking a new one per message.
 */
async function notifyNewMessage(input: { recipientId: string; senderName: string; conversationId: string; body: string }) {
  const linkUrl = `/community/messages/${input.conversationId}`;
  const data = {
    title: `New message from ${input.senderName}`,
    body: input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body,
  };
  try {
    const unread = await db.notification.findFirst({
      where: { userId: input.recipientId, type: "COMMUNITY_MESSAGE", linkUrl, isRead: false },
      select: { id: true },
    });
    if (unread) {
      await db.notification.update({ where: { id: unread.id }, data: { ...data, createdAt: new Date() } });
    } else {
      await db.notification.create({ data: { userId: input.recipientId, type: "COMMUNITY_MESSAGE", linkUrl, ...data } });
    }
  } catch {
    // The message itself was sent; a failed notification must not undo that.
  }
}

async function markRead(conversationId: string, userId: string) {
  const now = new Date();
  // Each updateMany only matches if the caller is that side, so one of the two does nothing.
  await db.$transaction([
    db.conversation.updateMany({ where: { id: conversationId, userAId: userId }, data: { userALastReadAt: now } }),
    db.conversation.updateMany({ where: { id: conversationId, userBId: userId }, data: { userBLastReadAt: now } }),
    // Opening the chat also clears its "new message" notification.
    db.notification.updateMany({
      where: { userId, type: "COMMUNITY_MESSAGE", linkUrl: `/community/messages/${conversationId}`, isRead: false },
      data: { isRead: true },
    }),
  ]);
}
