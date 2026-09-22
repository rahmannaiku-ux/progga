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
