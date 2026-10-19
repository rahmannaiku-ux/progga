-- Groups can be public or private (joined by request), and have admins as well as moderators.
-- CreateEnum
CREATE TYPE "CommunityGroupPrivacy" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterEnum (kept in rank order: owner, admin, moderator, member)
ALTER TYPE "CommunityGroupRole" ADD VALUE 'ADMIN' AFTER 'OWNER';

-- AlterTable
ALTER TABLE "CommunityGroup" ADD COLUMN     "privacy" "CommunityGroupPrivacy" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "CommunityGroupJoinRequest" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityGroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityGroupJoinRequest_groupId_createdAt_idx" ON "CommunityGroupJoinRequest"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityGroupJoinRequest_userId_idx" ON "CommunityGroupJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityGroupJoinRequest_groupId_userId_key" ON "CommunityGroupJoinRequest"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "CommunityGroupJoinRequest" ADD CONSTRAINT "CommunityGroupJoinRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityGroupJoinRequest" ADD CONSTRAINT "CommunityGroupJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
