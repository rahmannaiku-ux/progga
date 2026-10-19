-- Partly watched lessons count towards mission progress: remember each lesson's length.
-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "durationSec" INTEGER NOT NULL DEFAULT 0;

