-- Two-person approval for the riskiest admin changes (schema.prisma: SensitiveChangeRequest).
-- Additive only: two new enums and one new table; no existing row or column changes.

-- CreateEnum
CREATE TYPE "SensitiveRequestKind" AS ENUM ('PAYMENT_NUMBER', 'GRANT_ADMIN');

-- CreateEnum
CREATE TYPE "SensitiveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SensitiveChangeRequest" (
    "id" TEXT NOT NULL,
    "kind" "SensitiveRequestKind" NOT NULL,
    "status" "SensitiveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensitiveChangeRequest_status_createdAt_idx" ON "SensitiveChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SensitiveChangeRequest_requestedById_idx" ON "SensitiveChangeRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "SensitiveChangeRequest" ADD CONSTRAINT "SensitiveChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensitiveChangeRequest" ADD CONSTRAINT "SensitiveChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same defence as 20261019080000_security_hardening: RLS on with no policies, so Supabase's
-- public API roles can never read this table (Prisma connects as the owner, unaffected).
ALTER TABLE "SensitiveChangeRequest" ENABLE ROW LEVEL SECURITY;
