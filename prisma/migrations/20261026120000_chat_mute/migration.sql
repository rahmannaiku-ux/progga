-- Mute a direct or group chat until a moment (no notifications, not counted in the Chats badge).
ALTER TABLE "Conversation" ADD COLUMN "userAMutedUntil" TIMESTAMP(3),
ADD COLUMN "userBMutedUntil" TIMESTAMP(3);

ALTER TABLE "GroupChatMember" ADD COLUMN "mutedUntil" TIMESTAMP(3);
