-- CreateEnum
CREATE TYPE "CommunityPostKind" AS ENUM ('POST', 'QUESTION', 'POLL');

-- CreateEnum
CREATE TYPE "CommunityReactionType" AS ENUM ('LIKE', 'LOVE', 'CELEBRATE', 'INSIGHTFUL', 'CURIOUS');

-- CreateEnum
CREATE TYPE "CommunityGroupRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "CommunityReportTarget" AS ENUM ('POST', 'COMMENT', 'PROFILE');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_REACTION';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_FOLLOW';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_ANSWER';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_MODERATION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "communityPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "groupId" TEXT,
    "kind" "CommunityPostKind" NOT NULL DEFAULT 'POST',
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sharedPostId" TEXT,
    "acceptedCommentId" TEXT,
    "pollClosesAt" TIMESTAMP(3),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CommunityReactionType" NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPollOption" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CommunityPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPollVote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySavedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunitySavedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CommunityGroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "userALastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userBLastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "CommunityReportTarget" NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "targetUserId" TEXT,
    "targetKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPost_acceptedCommentId_key" ON "CommunityPost"("acceptedCommentId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_groupId_createdAt_idx" ON "CommunityPost"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_kind_createdAt_idx" ON "CommunityPost"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_sharedPostId_idx" ON "CommunityPost"("sharedPostId");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_parentId_idx" ON "CommunityComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_idx" ON "CommunityComment"("authorId");

-- CreateIndex
CREATE INDEX "CommunityReaction_userId_idx" ON "CommunityReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReaction_postId_userId_key" ON "CommunityReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPollOption_postId_idx" ON "CommunityPollOption"("postId");

-- CreateIndex
CREATE INDEX "CommunityPollVote_optionId_idx" ON "CommunityPollVote"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPollVote_postId_userId_key" ON "CommunityPollVote"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunitySavedPost_userId_createdAt_idx" ON "CommunitySavedPost"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySavedPost_userId_postId_key" ON "CommunitySavedPost"("userId", "postId");

-- CreateIndex
CREATE INDEX "CommunityFollow_followingId_idx" ON "CommunityFollow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityFollow_followerId_followingId_key" ON "CommunityFollow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityGroup_slug_key" ON "CommunityGroup"("slug");

-- CreateIndex
CREATE INDEX "CommunityGroup_topic_idx" ON "CommunityGroup"("topic");

-- CreateIndex
CREATE INDEX "CommunityGroup_createdAt_idx" ON "CommunityGroup"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityGroupMember_userId_idx" ON "CommunityGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityGroupMember_groupId_userId_key" ON "CommunityGroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Conversation_userAId_lastMessageAt_idx" ON "Conversation"("userAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_userBId_lastMessageAt_idx" ON "Conversation"("userBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_userAId_userBId_key" ON "Conversation"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_status_createdAt_idx" ON "CommunityReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_targetType_targetKey_key" ON "CommunityReport"("reporterId", "targetType", "targetKey");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_sharedPostId_fkey" FOREIGN KEY ("sharedPostId") REFERENCES "CommunityPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_acceptedCommentId_fkey" FOREIGN KEY ("acceptedCommentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReaction" ADD CONSTRAINT "CommunityReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReaction" ADD CONSTRAINT "CommunityReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPollOption" ADD CONSTRAINT "CommunityPollOption_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPollVote" ADD CONSTRAINT "CommunityPollVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPollVote" ADD CONSTRAINT "CommunityPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CommunityPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPollVote" ADD CONSTRAINT "CommunityPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySavedPost" ADD CONSTRAINT "CommunitySavedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySavedPost" ADD CONSTRAINT "CommunitySavedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroup" ADD CONSTRAINT "CommunityGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroupMember" ADD CONSTRAINT "CommunityGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroupMember" ADD CONSTRAINT "CommunityGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

