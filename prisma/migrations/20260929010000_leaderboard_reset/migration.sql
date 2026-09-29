-- Leaderboard periods: admins can reset the board (manually or on a
-- daily/weekly/monthly schedule) without touching anyone's XP/level.
CREATE TABLE "LeaderboardReset" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetById" TEXT,
    "resetByName" TEXT,

    CONSTRAINT "LeaderboardReset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaderboardReset_createdAt_idx" ON "LeaderboardReset"("createdAt");

-- The period leaderboard sums RewardEvent.amount over a createdAt range.
CREATE INDEX "RewardEvent_createdAt_idx" ON "RewardEvent"("createdAt");
