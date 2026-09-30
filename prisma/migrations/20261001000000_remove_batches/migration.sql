-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_courseId_fkey";

-- DropForeignKey
ALTER TABLE "BatchMember" DROP CONSTRAINT "BatchMember_batchId_fkey";

-- DropForeignKey
ALTER TABLE "BatchMember" DROP CONSTRAINT "BatchMember_userId_fkey";

-- DropTable
DROP TABLE "Batch";

-- DropTable
DROP TABLE "BatchMember";

