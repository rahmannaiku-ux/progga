-- SMS payment automation: strictly additive. Existing Payment / PaymentBridgeDevice
-- rows, coupon logic and enrollment relationships are untouched.

-- New value on an existing enum (not referenced elsewhere in this migration).
ALTER TYPE "VerificationMethod" ADD VALUE 'AUTOMATIC_SMS';

-- CreateEnum
CREATE TYPE "MfsProvider" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'UPAY');
CREATE TYPE "SmsAutoVerifyMode" AS ENUM ('OFF', 'SHADOW', 'ENFORCE');
CREATE TYPE "TransactionVerificationStatus" AS ENUM ('OBSERVED', 'PARSING_FAILED', 'SUSPICIOUS', 'UNVERIFIED', 'MATCHED', 'VERIFIED', 'REJECTED', 'DUPLICATE');
CREATE TYPE "SmsRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- AlterTable: SiteSettings
ALTER TABLE "SiteSettings" ADD COLUMN "smsAutoVerifyMode" "SmsAutoVerifyMode" NOT NULL DEFAULT 'SHADOW';

-- AlterTable: Payment
ALTER TABLE "Payment"
  ADD COLUMN "mfsProvider" "MfsProvider",
  ADD COLUMN "receivingNumber" TEXT,
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Payment_publicId_key" ON "Payment"("publicId");
CREATE UNIQUE INDEX "Payment_userId_idempotencyKey_key" ON "Payment"("userId", "idempotencyKey");
CREATE INDEX "Payment_mfsProvider_status_idx" ON "Payment"("mfsProvider", "status");

-- AlterTable: PaymentBridgeDevice
ALTER TABLE "PaymentBridgeDevice"
  ADD COLUMN "installId" TEXT,
  ADD COLUMN "platform" TEXT,
  ADD COLUMN "appVersion" TEXT,
  ADD COLUMN "androidVersion" TEXT,
  ADD COLUMN "lastSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastTransactionAt" TIMESTAMP(3),
  ADD COLUMN "registeredAt" TIMESTAMP(3),
  ADD COLUMN "registrationCodeHash" TEXT,
  ADD COLUMN "registrationCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "reportedConfigVersions" JSONB,
  ADD COLUMN "credentialRotatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PaymentBridgeDevice_installId_key" ON "PaymentBridgeDevice"("installId");
CREATE UNIQUE INDEX "PaymentBridgeDevice_registrationCodeHash_key" ON "PaymentBridgeDevice"("registrationCodeHash");

-- CreateTable
CREATE TABLE "PaymentConfiguration" (
  "id" TEXT NOT NULL,
  "provider" "MfsProvider" NOT NULL,
  "receivingNumber" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "configurationVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentConfiguration_provider_key" ON "PaymentConfiguration"("provider");

-- CreateTable
CREATE TABLE "ProviderConfiguration" (
  "id" TEXT NOT NULL,
  "provider" "MfsProvider" NOT NULL,
  "version" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rules" JSONB NOT NULL,
  "rulesHash" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderConfiguration_provider_version_key" ON "ProviderConfiguration"("provider", "version");
CREATE INDEX "ProviderConfiguration_provider_enabled_effectiveAt_idx" ON "ProviderConfiguration"("provider", "enabled", "effectiveAt");

-- CreateTable
CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "provider" "MfsProvider" NOT NULL,
  "transactionId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "senderNumber" TEXT,
  "receiverNumber" TEXT,
  "transactionTime" TIMESTAMP(3),
  "messageHash" TEXT NOT NULL,
  "providerRuleVersion" INTEGER NOT NULL,
  "localReceivedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deviceId" TEXT NOT NULL,
  "deviceAssessment" JSONB,
  "verificationStatus" "TransactionVerificationStatus" NOT NULL DEFAULT 'OBSERVED',
  "trustLevel" INTEGER NOT NULL DEFAULT 1,
  "riskLevel" "SmsRiskLevel" NOT NULL DEFAULT 'LOW',
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "verificationReasons" JSONB,
  "decisionMode" TEXT,
  "matchedPaymentId" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentTransaction_provider_transactionId_key" ON "PaymentTransaction"("provider", "transactionId");
CREATE INDEX "PaymentTransaction_messageHash_idx" ON "PaymentTransaction"("messageHash");
CREATE INDEX "PaymentTransaction_deviceId_receivedAt_idx" ON "PaymentTransaction"("deviceId", "receivedAt");
CREATE INDEX "PaymentTransaction_verificationStatus_idx" ON "PaymentTransaction"("verificationStatus");
CREATE INDEX "PaymentTransaction_matchedPaymentId_idx" ON "PaymentTransaction"("matchedPaymentId");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PaymentBridgeDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_matchedPaymentId_fkey" FOREIGN KEY ("matchedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Defense in depth beyond Prisma: money must be positive, trust level in range.
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_amountMinor_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_trustLevel_range" CHECK ("trustLevel" BETWEEN 0 AND 5);

-- CreateTable
CREATE TABLE "DeviceRequestNonce" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceRequestNonce_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceRequestNonce_deviceId_requestId_key" ON "DeviceRequestNonce"("deviceId", "requestId");
CREATE INDEX "DeviceRequestNonce_createdAt_idx" ON "DeviceRequestNonce"("createdAt");
ALTER TABLE "DeviceRequestNonce" ADD CONSTRAINT "DeviceRequestNonce_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PaymentBridgeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PaymentAuditLog" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "transactionId" TEXT,
  "deviceId" TEXT,
  "event" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAuditLog_paymentId_createdAt_idx" ON "PaymentAuditLog"("paymentId", "createdAt");
CREATE INDEX "PaymentAuditLog_transactionId_idx" ON "PaymentAuditLog"("transactionId");
CREATE INDEX "PaymentAuditLog_deviceId_createdAt_idx" ON "PaymentAuditLog"("deviceId", "createdAt");
CREATE INDEX "PaymentAuditLog_event_createdAt_idx" ON "PaymentAuditLog"("event", "createdAt");

-- CreateTable
CREATE TABLE "PaymentWebhook" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentWebhook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentWebhook_paymentId_event_endpoint_key" ON "PaymentWebhook"("paymentId", "event", "endpoint");
CREATE INDEX "PaymentWebhook_status_nextRetryAt_idx" ON "PaymentWebhook"("status", "nextRetryAt");
