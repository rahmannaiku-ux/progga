-- Manual migration: Live Room foundation (LiveClass + LiveClassAttendance)
--
-- ADDITIVE ONLY. Creates one enum and two tables; adds NO columns to and
-- alters NO rows in any existing table (Lesson/Course/User only gain
-- Prisma back-relation fields, which have no SQL representation).
-- Nothing here is destructive and nothing needs data preserved.
--
-- Workflow (same convention as the other files in this folder):
--   1. npx prisma format
--   2. npx prisma migrate dev --create-only --name live_room_foundation
--   3. Compare the generated migration.sql with "PART 1" below (it should
--      match apart from formatting). PART 1 is a hand-written REFERENCE of
--      what Prisma is expected to emit — it was written WITHOUT being able
--      to run Prisma, so the generated file is authoritative.
--   4. Append "PART 2" to the END of the generated migration.sql, then
--      apply with `prisma migrate dev` / `prisma migrate deploy`.
--
-- IF THIS DATABASE IS MANAGED WITH `prisma db push` (not migrate): db push
-- creates the tables but NOT the partial unique index below, because
-- Prisma's schema language cannot express it. Run PART 2 by hand once
-- (it is idempotent).
--
-- Open question (UNVERIFIED): whether a later `prisma migrate dev` treats
-- the hand-added partial index as drift and proposes to drop it. If it
-- does, re-append PART 2 to that generated migration or keep the index
-- out of the Prisma-managed history and apply it only from this file.

-- =====================================================================
-- PART 1 — reference for the Prisma-generated portion
-- =====================================================================

-- CreateEnum
CREATE TYPE "LiveClassState" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LiveClass" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "state" "LiveClassState" NOT NULL DEFAULT 'SCHEDULED',
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "startedById" TEXT,
    "endedById" TEXT,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chatProvider" TEXT NOT NULL DEFAULT 'stream',
    "endSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveClassAttendance" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "reconnectCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiveClassAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveClass_lessonId_key" ON "LiveClass"("lessonId");

-- CreateIndex
CREATE INDEX "LiveClass_courseId_state_idx" ON "LiveClass"("courseId", "state");

-- CreateIndex
CREATE INDEX "LiveClass_state_idx" ON "LiveClass"("state");

-- CreateIndex
CREATE INDEX "LiveClassAttendance_liveClassId_userId_idx" ON "LiveClassAttendance"("liveClassId", "userId");

-- CreateIndex
CREATE INDEX "LiveClassAttendance_liveClassId_leftAt_idx" ON "LiveClassAttendance"("liveClassId", "leftAt");

-- CreateIndex
CREATE INDEX "LiveClassAttendance_userId_idx" ON "LiveClassAttendance"("userId");

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClassAttendance" ADD CONSTRAINT "LiveClassAttendance_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClassAttendance" ADD CONSTRAINT "LiveClassAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- PART 2 — hand-written; Prisma cannot express a partial unique index
-- =====================================================================
-- At most ONE open (leftAt IS NULL) attendance session per student per
-- class. The attendance service treats a unique violation (P2002) on
-- this index as "session already open" and reuses it, which makes
-- concurrent joins/reconnects race-safe.

CREATE UNIQUE INDEX IF NOT EXISTS "LiveClassAttendance_one_open_session_key"
  ON "LiveClassAttendance" ("liveClassId", "userId")
  WHERE "leftAt" IS NULL;
