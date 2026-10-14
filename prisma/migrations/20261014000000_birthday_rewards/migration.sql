-- Birthday rewards: a private date of birth on StudentProfile, expiring
-- reward coin lots, the once-per-year BirthdayReward record, Web Push
-- subscriptions and a delivery outbox. Schema only: no rows are written,
-- so nobody is rewarded, notified or has a balance changed by migrating.

-- CreateEnum
CREATE TYPE "CoinRewardLotKind" AS ENUM ('BIRTHDAY');

-- CreateEnum
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('WEB_PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_REWARD';
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_REWARD_EXPIRING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CoinTransactionType" ADD VALUE 'BIRTHDAY_REWARD';
ALTER TYPE "CoinTransactionType" ADD VALUE 'REWARD_EXPIRY';
ALTER TYPE "CoinTransactionType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "dateOfBirthSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CoinRewardLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CoinRewardLotKind" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "expiredAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinRewardLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinLotConsumption" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "restored" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinLotConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BirthdayReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthdayYear" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "birthdayDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lotId" TEXT NOT NULL,
    "celebrationSeenAt" TIMESTAMP(3),
    "expiryReminderQueuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "providerResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinRewardLot_transactionId_key" ON "CoinRewardLot"("transactionId");

-- CreateIndex
CREATE INDEX "CoinRewardLot_userId_expiresAt_idx" ON "CoinRewardLot"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "CoinRewardLot_expiresAt_idx" ON "CoinRewardLot"("expiresAt");

-- CreateIndex
CREATE INDEX "CoinLotConsumption_transactionId_idx" ON "CoinLotConsumption"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinLotConsumption_lotId_transactionId_key" ON "CoinLotConsumption"("lotId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayReward_idempotencyKey_key" ON "BirthdayReward"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayReward_lotId_key" ON "BirthdayReward"("lotId");

-- CreateIndex
CREATE INDEX "BirthdayReward_expiresAt_idx" ON "BirthdayReward"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayReward_userId_birthdayYear_key" ON "BirthdayReward"("userId", "birthdayYear");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_idx" ON "NotificationDelivery"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_dedupeKey_channel_key" ON "NotificationDelivery"("dedupeKey", "channel");

-- AddForeignKey
ALTER TABLE "CoinRewardLot" ADD CONSTRAINT "CoinRewardLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinRewardLot" ADD CONSTRAINT "CoinRewardLot_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ProggyCoinTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLotConsumption" ADD CONSTRAINT "CoinLotConsumption_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CoinRewardLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLotConsumption" ADD CONSTRAINT "CoinLotConsumption_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ProggyCoinTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayReward" ADD CONSTRAINT "BirthdayReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayReward" ADD CONSTRAINT "BirthdayReward_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CoinRewardLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Balances can never go negative or exceed what was granted.
ALTER TABLE "CoinRewardLot" ADD CONSTRAINT "CoinRewardLot_amounts_check" CHECK ("amount" > 0 AND "remaining" >= 0 AND "remaining" <= "amount" AND "expiredAmount" >= 0);
ALTER TABLE "CoinLotConsumption" ADD CONSTRAINT "CoinLotConsumption_amount_check" CHECK ("amount" > 0 AND "restored" >= 0 AND "restored" <= "amount");
