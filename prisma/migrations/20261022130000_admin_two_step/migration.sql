-- Two-step sign-in for admins (src/lib/auth/admin-mfa.ts). Additive: nullable columns and an
-- empty-array default; no existing row changes meaning. Admins set it up at their next visit.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" INTEGER,
ADD COLUMN     "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaSecretEncrypted" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);
