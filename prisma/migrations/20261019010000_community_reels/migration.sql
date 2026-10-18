-- Community reels: short videos stored in Google Drive and played on the site.
-- AlterEnum
ALTER TYPE "UploadContext" ADD VALUE 'COMMUNITY_VIDEO';

-- AlterEnum
ALTER TYPE "CommunityPostKind" ADD VALUE 'REEL';

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "resumableUrl" TEXT;

-- AlterTable
ALTER TABLE "GoogleDriveConnection" ADD COLUMN     "reelsFolderId" TEXT;

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "videoDurationSec" INTEGER,
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPost_videoUrl_key" ON "CommunityPost"("videoUrl");

