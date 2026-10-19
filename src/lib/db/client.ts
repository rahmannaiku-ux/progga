import { PrismaClient } from "@prisma/client";
import { SHARED_STORE_KEY } from "@/lib/rate-limit";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// The shared rate-limit store (see checkRateLimit): one atomic upsert per
// check, a fixed window per key. Old windows are cleared now and then.
(globalThis as Record<string, unknown>)[SHARED_STORE_KEY] = async (key: string, max: number, windowMs: number) => {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, NOW() + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN NOW() + ${windowMs} * INTERVAL '1 millisecond' ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"`;
  if (Math.random() < 0.01) {
    db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '1 hour'`.catch(() => {});
  }
  return (rows[0]?.count ?? 1) <= max;
};
