-- CreateEnum
CREATE TYPE "CourseTeacherRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CourseTeacherRequest" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "CourseTeacherRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTeacherRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseTeacherRequest_status_idx" ON "CourseTeacherRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTeacherRequest_courseId_teacherId_key" ON "CourseTeacherRequest"("courseId", "teacherId");

-- AddForeignKey
ALTER TABLE "CourseTeacherRequest" ADD CONSTRAINT "CourseTeacherRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacherRequest" ADD CONSTRAINT "CourseTeacherRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacherRequest" ADD CONSTRAINT "CourseTeacherRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacherRequest" ADD CONSTRAINT "CourseTeacherRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

