-- CreateEnum
CREATE TYPE "CourseMigrationStatus" AS ENUM ('REQUESTED', 'AWAITING_PAYMENT', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedSummary" JSONB,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN     "schoolVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourseMigration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromCourseId" TEXT,
    "toCourseId" TEXT,
    "fromCourseTitle" TEXT NOT NULL,
    "toCourseTitle" TEXT NOT NULL,
    "fromPriceCents" INTEGER NOT NULL,
    "toPriceCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "CourseMigrationStatus" NOT NULL,
    "byAdmin" BOOLEAN NOT NULL DEFAULT false,
    "feeWaived" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "adminNote" TEXT,
    "handledById" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CourseMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseMigration_paymentId_key" ON "CourseMigration"("paymentId");

-- CreateIndex
CREATE INDEX "CourseMigration_userId_status_idx" ON "CourseMigration"("userId", "status");

-- CreateIndex
CREATE INDEX "CourseMigration_status_createdAt_idx" ON "CourseMigration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_deletionScheduledFor_idx" ON "User"("deletionScheduledFor");

-- AddForeignKey
ALTER TABLE "CourseMigration" ADD CONSTRAINT "CourseMigration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMigration" ADD CONSTRAINT "CourseMigration_fromCourseId_fkey" FOREIGN KEY ("fromCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMigration" ADD CONSTRAINT "CourseMigration_toCourseId_fkey" FOREIGN KEY ("toCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMigration" ADD CONSTRAINT "CourseMigration_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMigration" ADD CONSTRAINT "CourseMigration_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Same as every table: no access through the Supabase Data API (the app connects as the owner).
ALTER TABLE "CourseMigration" ENABLE ROW LEVEL SECURITY;
