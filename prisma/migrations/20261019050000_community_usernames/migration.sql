-- Unique community usernames (@handles), stored lowercase.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT,
ADD COLUMN     "usernameChangedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
