-- Phase 1: schema foundation for the custom Proggaa (phone + password)
-- authentication system. Purely additive — no columns are dropped, no
-- rows are deleted, and every new column that existing rows can't
-- possibly already have a value for is added as NULLable so this applies
-- cleanly against the current dataset. `User.clerkId` and all existing
-- Clerk-era columns are untouched; they are removed in a later phase's
-- migration once the app no longer reads them.

-- New enums
CREATE TYPE "StudyVersion" AS ENUM ('BANGLA', 'ENGLISH');
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTRATION', 'PASSWORD_RESET');

-- User: new auth columns
ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Postgres allows multiple NULLs under a UNIQUE index, so this is safe
-- even though every existing row currently has phone = NULL.
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- StudentProfile: new mandatory first-login-profile columns (nullable at
-- the DB level; required-ness is enforced by the application when the
-- profile-completion flow writes them in a later phase).
ALTER TABLE "StudentProfile"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "collegeName" TEXT,
  ADD COLUMN "collegeEIIN" TEXT,
  ADD COLUMN "fatherPhone" TEXT,
  ADD COLUMN "motherPhone" TEXT,
  ADD COLUMN "hscBatch" TEXT,
  ADD COLUMN "studyVersion" "StudyVersion";

-- Session: server-side sessions. Only tokenHash is ever stored — never
-- the raw browser session token.
CREATE TABLE "Session" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "tokenHash"      TEXT NOT NULL,
  "deviceId"       TEXT,
  "deviceLabel"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "revokedAt"      TIMESTAMP(3),

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Otp: registration phone-verification + password-reset codes. Only
-- codeHash is ever stored — never the plaintext OTP. userId is nullable
-- because a REGISTRATION otp is requested before any User row exists.
CREATE TABLE "Otp" (
  "id"          TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "userId"      TEXT,
  "purpose"     "OtpPurpose" NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "consumedAt"  TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSentAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Otp_phone_purpose_idx" ON "Otp"("phone", "purpose");
CREATE INDEX "Otp_userId_idx" ON "Otp"("userId");
CREATE INDEX "Otp_expiresAt_idx" ON "Otp"("expiresAt");

ALTER TABLE "Otp"
  ADD CONSTRAINT "Otp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
