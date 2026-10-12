-- Per-exam tab-switch limit, option shuffling and delayed answer reveal.
-- All additive with defaults that match the old behaviour (limit 3, no
-- shuffle, answers shown as before).
-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "revealAnswersAfterClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tabSwitchLimit" INTEGER NOT NULL DEFAULT 3;

-- Extra time a mentor grants one attempt.
-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "extraTimeSeconds" INTEGER NOT NULL DEFAULT 0;

-- Mentor actions on an attempt (more time, reopened, disqualification
-- cleared) show up in its timeline.
-- AlterEnum
ALTER TYPE "ExamIntegrityEventType" ADD VALUE 'MENTOR_ACTION';
