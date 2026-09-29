-- Payments are proof of purchase: deleting a course must not delete them.
-- courseId becomes nullable with ON DELETE SET NULL, and the course title
-- is snapshotted so invoices still render after the course is gone.
ALTER TABLE "Payment" ADD COLUMN "courseTitle" TEXT;

UPDATE "Payment" p SET "courseTitle" = c."title" FROM "Course" c WHERE c."id" = p."courseId";

ALTER TABLE "Payment" ALTER COLUMN "courseId" DROP NOT NULL;

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_courseId_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
