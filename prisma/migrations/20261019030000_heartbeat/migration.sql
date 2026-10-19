-- Database keep-alive heartbeat (see src/app/api/keepalive/route.ts).
-- CreateTable
CREATE TABLE "Heartbeat" (
    "id" TEXT NOT NULL,
    "pingedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

