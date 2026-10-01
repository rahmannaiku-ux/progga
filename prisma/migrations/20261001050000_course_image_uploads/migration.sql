-- AlterEnum
ALTER TYPE "UploadContext" ADD VALUE 'COURSE_ROUTINE';
ALTER TYPE "UploadContext" ADD VALUE 'LESSON_THUMBNAIL';

-- AlterTable
ALTER TABLE "GoogleDriveConnection" ADD COLUMN "courseMediaFolderId" TEXT;
