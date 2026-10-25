import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------
// Birthday rewards + expiring coins, against a real Postgres. SKIPPED
// unless BIRTHDAY_TEST_DATABASE_URL points at a LOCAL database, so
// `npm test` stays DB-free and this can never touch production:
//
//   BIRTHDAY_TEST_DATABASE_URL=postgresql://test:test@localhost:54330/bday_test npx vitest run src/server/services/birthday.integration.test.ts
//
// The database needs the migrations applied (prisma migrate deploy).
// ---------------------------------------------------------------------

const TEST_URL = process.env.BIRTHDAY_TEST_DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1)[:/]/.test(TEST_URL);
if (isLocal) {
  process.env.DATABASE_URL = TEST_URL;
  process.env.DIRECT_URL = TEST_URL;
}
delete process.env.VAPID_PRIVATE_KEY; // phone push "not configured" unless a test says otherwise

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/server/actions/require-user", () => ({
  requireActiveUser: async () => {
    if (!session.user) throw new Error("Your session has expired. Please sign in again.");
    return session.user;
  },
  requireAdminUser: async () => {
    throw new Error("Admin access required.");
  },
  requireMentorUser: async () => session.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

const DAY = 24 * 60 * 60 * 1000;
// Store purchases and admin adjustments use the real clock, so the shared
// birthday is "today": a student born on today's Dhaka month/day in 2008.
const BDAY_NOON = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const dhakaParts = (d: Date) => {
  const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }).split("-").map(Number);
  return { y: y!, m: m!, d: day! };
};
const T = dhakaParts(BDAY_NOON);
const YEAR = T.y;
const DOB = `2008-${pad(T.m)}-${pad(T.d === 29 && T.m === 2 ? 28 : T.d)}`;

describe.skipIf(!isLocal)("Birthday rewards (integration)", () => {
  let db: typeof import("@/lib/db/client").db;
  let birthday: typeof import("./birthday");
  let coins: typeof import("@/lib/gamification/coins");
  let push: typeof import("./push-delivery");
  let actions: typeof import("@/server/actions/birthday-actions");
  const tag = `bd${Date.now().toString(36)}`;
  let seq = 0;
  let itemSeq = 0;

  async function student(dob: string | null, opts: { coins?: number; role?: string; isSuspended?: boolean } = {}) {
    seq++;
    const user = await db.user.create({
      data: {
        firstName: `Hero${seq}`,
        lastName: tag,
        role: (opts.role ?? "STUDENT") as never,
        isSuspended: opts.isSuspended ?? false,
        profileCompleted: true,
        phone: `${tag}-${seq}`,
        studentProfile: { create: { name: `Nadia ${tag}`, dateOfBirth: dob ? new Date(`${dob}T00:00:00Z`) : null } },
        heroStats: { create: { coinBalance: opts.coins ?? 0 } },
      },
      select: { id: true, firstName: true },
    });
    return user;
  }

  async function item(price: number) {
    itemSeq++;
    return db.coinStoreItem.create({
      data: { title: `${tag} item ${itemSeq}`, description: "test", type: "STICKER", priceCoins: price, resourceUrl: "/x.png", createdById: "test" },
    });
  }

  const balance = async (userId: string) => (await db.heroStats.findUniqueOrThrow({ where: { userId } })).coinBalance;
  const lotOf = async (userId: string) => db.coinRewardLot.findFirstOrThrow({ where: { userId } });

  /** Grants at BDAY_NOON without a phone attempt and returns the reward. */
  async function granted(dob = DOB, coinsBefore = 0) {
    const u = await student(dob, { coins: coinsBefore });
    const res = await birthday.grantBirthdayRewardIfDue(u.id, { now: BDAY_NOON, deliver: false });
    expect(res.status).toBe("granted");
    return u;
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
    birthday = await import("./birthday");
    coins = await import("@/lib/gamification/coins");
    push = await import("./push-delivery");
    actions = await import("@/server/actions/birthday-actions");
  });

  afterAll(async () => {
    await db.coinPurchase.deleteMany({ where: { user: { lastName: tag } } });
    await db.user.deleteMany({ where: { lastName: tag } });
    await db.coinStoreItem.deleteMany({ where: { title: { startsWith: tag } } });
    await db.$disconnect();
  });

  // ------------------------------------------------------------------
  describe("granting", () => {
    it("credits exactly 1,500 coins once, with ledger, lot, reward, notification and queued push", async () => {
      const u = await student(DOB, { coins: 250 });
      const res = await birthday.grantBirthdayRewardIfDue(u.id, { now: BDAY_NOON, deliver: false });
      expect(res.status).toBe("granted");

      expect(await balance(u.id)).toBe(1750);
      const tx = await db.proggyCoinTransaction.findMany({ where: { userId: u.id } });
      expect(tx).toHaveLength(1);
      expect(tx[0]).toMatchObject({ amount: 1500, type: "BIRTHDAY_REWARD", reason: `Birthday Reward — ${YEAR}`, sourceType: "BIRTHDAY", sourceId: `birthday:${u.id}:${YEAR}` });

      const reward = await db.birthdayReward.findUniqueOrThrow({ where: { userId_birthdayYear: { userId: u.id, birthdayYear: YEAR } } });
      expect(reward.amount).toBe(1500);
      expect(reward.idempotencyKey).toBe(`birthday:${u.id}:${YEAR}`);
      expect(reward.grantedAt.toISOString()).toBe(BDAY_NOON.toISOString());
      expect(reward.expiresAt.getTime() - reward.grantedAt.getTime()).toBe(30 * DAY);
      expect(reward.birthdayDate.toISOString()).toBe(`${YEAR}-${DOB.slice(5)}T00:00:00.000Z`);

      const lot = await lotOf(u.id);
      expect(lot).toMatchObject({ amount: 1500, remaining: 1500, kind: "BIRTHDAY", expiredAt: null });
      expect(lot.expiresAt.toISOString()).toBe(reward.expiresAt.toISOString());

      const notes = await db.notification.findMany({ where: { userId: u.id } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: "BIRTHDAY_REWARD", title: "Happy birthday from Proggaa", linkUrl: "/birthday" });
      expect(notes[0]!.body).toContain(`Happy Birthday, Nadia!`);

      const deliveries = await db.notificationDelivery.findMany({ where: { userId: u.id } });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ status: "PENDING", attempts: 0, channel: "WEB_PUSH", notificationId: notes[0]!.id });
    });

    it("is exactly once under 12 concurrent requests (tabs, devices, cron) and on later retries", async () => {
      const u = await student(DOB);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => birthday.grantBirthdayRewardIfDue(u.id, { now: BDAY_NOON, deliver: false }))
      );
      expect(results.filter((r) => r.status === "granted")).toHaveLength(1);
      expect(results.filter((r) => r.status === "already_granted")).toHaveLength(11);
      // Later the same day and again a week later (e.g. an admin moved the birthday): still once this year.
      expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: new Date(BDAY_NOON.getTime() + 1000) })).status).toBe("already_granted");
      const weekLater = new Date(BDAY_NOON.getTime() + 7 * DAY);
      if (dhakaParts(weekLater).y === YEAR) {
        const w = dhakaParts(weekLater);
        await db.studentProfile.update({ where: { userId: u.id }, data: { dateOfBirth: new Date(`2008-${pad(w.m)}-${pad(w.d)}T00:00:00Z`) } });
        expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: weekLater })).status).toBe("already_granted");
      }

      expect(await balance(u.id)).toBe(1500);
      expect(await db.birthdayReward.count({ where: { userId: u.id } })).toBe(1);
      expect(await db.proggyCoinTransaction.count({ where: { userId: u.id } })).toBe(1);
      expect(await db.notification.count({ where: { userId: u.id } })).toBe(1);
      expect(await db.notificationDelivery.count({ where: { userId: u.id } })).toBe(1);
    });

    it("grants again the next year", async () => {
      const u = await granted();
      const nextYear = new Date(`${YEAR + 1}-${DOB.slice(5)}T06:00:00Z`);
      const res = await birthday.grantBirthdayRewardIfDue(u.id, { now: nextYear, deliver: false });
      expect(res.status).toBe("granted");
      expect(await db.birthdayReward.count({ where: { userId: u.id } })).toBe(2);
    });

    it("uses the Dhaka date: 00:30 Dhaka on the birthday counts, 23:30 Dhaka the day before doesn't", async () => {
      const u = await student("2008-03-15");
      expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: new Date("2026-03-14T17:30:00Z") })).status).toBe("not_birthday");
      expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: new Date("2026-03-14T18:30:00Z"), deliver: false })).status).toBe("granted");
    });

    it("refuses missing/invalid date of birth, non-students and suspended students", async () => {
      const none = await student(null);
      const mentor = await student(DOB, { role: "TEACHER" });
      const suspended = await student(DOB, { isSuspended: true });
      for (const u of [none, mentor, suspended]) {
        expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: BDAY_NOON })).status).toBe("ineligible");
        expect(await db.birthdayReward.count({ where: { userId: u.id } })).toBe(0);
        expect(await balance(u.id)).toBe(0);
      }
    });

    it("never grants retroactively: a birthday last month gives nothing today, from the job or a page load", async () => {
      const yesterday = dhakaParts(new Date(BDAY_NOON.getTime() - DAY));
      const u = await student(`2008-${pad(yesterday.m)}-${pad(yesterday.d)}`, { coins: 40 });
      await birthday.runBirthdayJob(BDAY_NOON);
      await birthday.runBirthdayChecksForUser(u, BDAY_NOON);
      expect(await db.birthdayReward.count({ where: { userId: u.id } })).toBe(0);
      expect(await balance(u.id)).toBe(40);
    });

    it("Feb 29 birthdays are found on Feb 28 in a non-leap year, and only then", async () => {
      const u = await student("2008-02-29");
      expect(await birthday.findTodaysBirthdayStudents(new Date("2027-03-01T06:00:00Z"))).not.toContain(u.id);
      expect(await birthday.findTodaysBirthdayStudents(new Date("2027-02-28T06:00:00Z"))).toContain(u.id);
      expect((await birthday.grantBirthdayRewardIfDue(u.id, { now: new Date("2027-02-28T06:00:00Z"), deliver: false })).status).toBe("granted");
      const reward = await db.birthdayReward.findFirstOrThrow({ where: { userId: u.id } });
      expect(reward.birthdayDate.toISOString()).toBe("2027-02-28T00:00:00.000Z");
      // Already rewarded this year: no longer listed.
      expect(await birthday.findTodaysBirthdayStudents(new Date("2027-02-28T07:00:00Z"))).not.toContain(u.id);
    });
  });

  // ------------------------------------------------------------------
  describe("spending and expiry", () => {
    it("spends birthday coins first, partially, and keeps other coins", async () => {
      const u = await granted(DOB, 300); // 300 regular + 1500 birthday
      const a = await item(1000);
      await coins.purchaseStoreItem(u.id, a.id);
      expect(await balance(u.id)).toBe(800);
      expect((await lotOf(u.id)).remaining).toBe(500);

      const b = await item(600);
      await coins.purchaseStoreItem(u.id, b.id);
      expect(await balance(u.id)).toBe(200); // 500 birthday + 100 regular spent
      expect((await lotOf(u.id)).remaining).toBe(0);

      const spends = await db.proggyCoinTransaction.findMany({ where: { userId: u.id, type: "STORE_PURCHASE" }, include: { lotConsumptions: true } });
      expect(spends.map((s) => s.lotConsumptions.reduce((n, c) => n + c.amount, 0)).sort((x, y) => x - y)).toEqual([500, 1000]);

      // Expiry later takes nothing from the 200 coins that never expire.
      await coins.expireDueCoinLots({ userId: u.id, now: new Date(BDAY_NOON.getTime() + 31 * DAY) });
      expect(await balance(u.id)).toBe(200);
    });

    it("expires exactly the unspent birthday coins 30 days after the grant, keeping history", async () => {
      const u = await granted(DOB, 300);
      await coins.purchaseStoreItem(u.id, (await item(400)).id);
      expect(await balance(u.id)).toBe(1400);

      const justBefore = new Date(BDAY_NOON.getTime() + 30 * DAY - 1);
      expect(await coins.expireDueCoinLots({ userId: u.id, now: justBefore })).toEqual({ users: 0, coins: 0 });
      expect(await balance(u.id)).toBe(1400);

      const at = new Date(BDAY_NOON.getTime() + 30 * DAY);
      expect(await coins.expireDueCoinLots({ userId: u.id, now: at })).toEqual({ users: 1, coins: 1100 });
      expect(await balance(u.id)).toBe(300);
      const lot = await lotOf(u.id);
      expect(lot).toMatchObject({ remaining: 0, expiredAmount: 1100 });
      expect(lot.expiredAt?.toISOString()).toBe(at.toISOString());

      const ledger = await db.proggyCoinTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
      expect(ledger.map((t) => [t.type, t.amount])).toEqual([
        ["BIRTHDAY_REWARD", 1500],
        ["STORE_PURCHASE", -400],
        ["REWARD_EXPIRY", -1100],
      ]);
      // Opening 300 (seeded, not a ledger row) + ledger total = balance.
      expect(300 + ledger.reduce((sum, t) => sum + t.amount, 0)).toBe(await balance(u.id));
    });

    it("duplicate, concurrent expiry jobs expire once", async () => {
      const u = await granted();
      const at = new Date(BDAY_NOON.getTime() + 31 * DAY);
      await Promise.all([
        coins.expireDueCoinLots({ now: at }),
        coins.expireDueCoinLots({ userId: u.id, now: at }),
        coins.expireDueCoinLots({ userId: u.id, now: at }),
        birthday.runBirthdayJob(at),
        birthday.runBirthdayChecksForUser(u, at),
      ]);
      expect(await balance(u.id)).toBe(0);
      expect(await db.proggyCoinTransaction.count({ where: { userId: u.id, type: "REWARD_EXPIRY" } })).toBe(1);
    });

    it("expired coins can't be spent even before the expiry job ran", async () => {
      const u = await granted(DOB, 300);
      const big = await item(500);
      // purchaseStoreItem uses the real clock; simulate "past expiry" by moving the lot's expiry into the past.
      await db.coinRewardLot.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(coins.purchaseStoreItem(u.id, big.id)).rejects.toBeInstanceOf(coins.InsufficientCoinsError);
      expect(await balance(u.id)).toBe(1800); // rolled back together with the failed purchase

      const small = await item(200);
      await coins.purchaseStoreItem(u.id, small.id); // expires the lot in the same transaction, then spends regular coins
      expect(await balance(u.id)).toBe(100);
      expect((await lotOf(u.id)).expiredAmount).toBe(1500);
      expect(await db.coinLotConsumption.count({ where: { lot: { userId: u.id } } })).toBe(0);
    });

    it("concurrent spending never overspends or goes negative", async () => {
      const u = await granted(); // 1500 birthday coins only
      const items = await Promise.all(Array.from({ length: 6 }, () => item(400)));
      const results = await Promise.allSettled(items.map((i) => coins.purchaseStoreItem(u.id, i.id)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(await balance(u.id)).toBe(300);
      expect((await lotOf(u.id)).remaining).toBe(300);
    });

    it("concurrent spend and expiry stay consistent", async () => {
      const u = await granted(DOB, 1000);
      await db.coinRewardLot.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() + 50) } });
      const it1 = await item(700);
      await new Promise((r) => setTimeout(r, 80));
      await Promise.allSettled([coins.purchaseStoreItem(u.id, it1.id), coins.expireDueCoinLots({ userId: u.id })]);
      // Either order ends the same: 1500 expired, 700 spent from the 1000 regular coins.
      expect(await balance(u.id)).toBe(300);
      expect(await db.proggyCoinTransaction.count({ where: { userId: u.id, type: "REWARD_EXPIRY" } })).toBe(1);
    });

    it("refunds put coins back into a live lot once, and forfeit an expired lot's share", async () => {
      const u = await granted(DOB, 100);
      await coins.purchaseStoreItem(u.id, (await item(1000)).id);
      const spend = await db.proggyCoinTransaction.findFirstOrThrow({ where: { userId: u.id, type: "STORE_PURCHASE" } });
      expect(await coins.refundCoinSpend(spend.id, "Item withdrawn", BDAY_NOON)).toEqual({ credited: 1000, forfeited: 0 });
      expect(await balance(u.id)).toBe(1600);
      expect((await lotOf(u.id)).remaining).toBe(1500);
      await expect(coins.refundCoinSpend(spend.id, "again", BDAY_NOON)).rejects.toBeInstanceOf(coins.AlreadyRefundedError);

      const v = await granted(DOB, 100);
      await coins.purchaseStoreItem(v.id, (await item(1200)).id); // 1200 from the lot
      const spend2 = await db.proggyCoinTransaction.findFirstOrThrow({ where: { userId: v.id, type: "STORE_PURCHASE" } });
      const later = new Date(BDAY_NOON.getTime() + 40 * DAY);
      await coins.expireDueCoinLots({ userId: v.id, now: later });
      expect(await balance(v.id)).toBe(100);
      expect(await coins.refundCoinSpend(spend2.id, "Late refund", later)).toEqual({ credited: 0, forfeited: 1200 });
      expect(await balance(v.id)).toBe(100);
    });

    it("admin deductions follow the same order; admin credits never expire", async () => {
      const u = await granted(DOB, 200);
      await coins.adjustCoinsAsAdmin(u.id, -300, "Correction");
      expect((await lotOf(u.id)).remaining).toBe(1200);
      await coins.adjustCoinsAsAdmin(u.id, 50, "Bonus");
      expect(await balance(u.id)).toBe(1450);
      await coins.expireDueCoinLots({ userId: u.id, now: new Date(BDAY_NOON.getTime() + 31 * DAY) });
      expect(await balance(u.id)).toBe(250);
      await expect(coins.adjustCoinsAsAdmin(u.id, -251, "Too much")).rejects.toBeInstanceOf(coins.InsufficientCoinsError);
    });
  });

  // ------------------------------------------------------------------
  describe("existing coin economy (regression)", () => {
    it("awardCoins stays idempotent and non-expiring", async () => {
      const u = await student(null);
      const src = { type: "EXAM_REWARD" as const, id: `${tag}-exam`, reason: "Exam" };
      expect(await coins.awardCoins(u.id, 75, src)).toEqual({ awarded: true });
      expect(await coins.awardCoins(u.id, 75, src)).toEqual({ awarded: false });
      expect(await balance(u.id)).toBe(75);
      expect(await db.coinRewardLot.count({ where: { userId: u.id } })).toBe(0);
    });

    it("store purchase: insufficient balance and already-owned still behave as before", async () => {
      const u = await student(null, { coins: 100 });
      const cheap = await item(60);
      await coins.purchaseStoreItem(u.id, cheap.id);
      await expect(coins.purchaseStoreItem(u.id, cheap.id)).rejects.toBeInstanceOf(coins.AlreadyOwnedError);
      await expect(coins.purchaseStoreItem(u.id, (await item(41)).id)).rejects.toBeInstanceOf(coins.InsufficientCoinsError);
      expect(await balance(u.id)).toBe(40);
    });
  });

  // ------------------------------------------------------------------
  describe("phone delivery (Web Push outbox)", () => {
    const sub = (userId: string, n: number) =>
      db.pushSubscription.create({
        data: { userId, endpoint: `https://push.example.com/${tag}/${userId}/${n}`, p256dh: "B".repeat(87), auth: "abcdefghijklmnopqrstuv" },
      });
    const deliveryOf = (userId: string) => db.notificationDelivery.findFirstOrThrow({ where: { userId } });

    it("is SKIPPED (not sent) when push isn't configured, or no device opted in", async () => {
      const u = await granted();
      const d = await deliveryOf(u.id);
      expect(await push.attemptPushDelivery(d.id, { now: BDAY_NOON, configured: false })).toBe("SKIPPED");
      expect((await deliveryOf(u.id)).providerResponse).toMatch(/not configured/);

      const v = await granted();
      const dv = await deliveryOf(v.id);
      expect(await push.attemptPushDelivery(dv.id, { now: BDAY_NOON, configured: true, sender: async () => ({ statusCode: 201 }) })).toBe("SKIPPED");
      expect((await deliveryOf(v.id)).providerResponse).toMatch(/No device/);
    });

    it("records failures, retries with backoff, then ACCEPTED, and never sends twice", async () => {
      const u = await granted();
      await sub(u.id, 1);
      const d = await deliveryOf(u.id);
      const sent: string[] = [];
      const failing = async (t: { endpoint: string }, payload: string) => {
        sent.push(payload);
        return { statusCode: 500, error: "boom" };
      };
      expect(await push.attemptPushDelivery(d.id, { now: BDAY_NOON, configured: true, sender: failing })).toBe("PENDING");
      let row = await deliveryOf(u.id);
      expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
      expect(row.lastAttemptAt?.toISOString()).toBe(BDAY_NOON.toISOString());
      expect(row.nextAttemptAt!.getTime() - BDAY_NOON.getTime()).toBe(60_000);
      expect(row.providerResponse).toContain("500");

      // Not due yet: the cron leaves it alone.
      expect(await push.deliverDuePushNotifications({ userId: u.id, now: new Date(BDAY_NOON.getTime() + 30_000), configured: true, sender: failing })).toEqual({});

      const ok = async (_t: unknown, payload: string) => {
        sent.push(payload);
        return { statusCode: 201 };
      };
      const later = new Date(BDAY_NOON.getTime() + 61_000);
      expect(await push.deliverDuePushNotifications({ userId: u.id, now: later, configured: true, sender: ok })).toEqual({ ACCEPTED: 1 });
      row = await deliveryOf(u.id);
      expect(row).toMatchObject({ status: "ACCEPTED", attempts: 2 });
      expect(row.acceptedAt?.toISOString()).toBe(later.toISOString());

      expect(await push.attemptPushDelivery(d.id, { now: later, configured: true, sender: ok })).toBeNull();
      expect(sent).toHaveLength(2);
      // Payload: only display text, a same-site link and the tag.
      const payload = JSON.parse(sent[1]!);
      expect(Object.keys(payload).sort()).toEqual(["body", "tag", "title", "url"]);
      expect(sent[1]).not.toContain(u.id);
      expect(sent[1]).not.toContain("2008");
      expect(payload.url).toBe("/birthday");
    });

    it("concurrent workers send each device once (lease)", async () => {
      const u = await granted();
      await sub(u.id, 1);
      await sub(u.id, 2);
      const d = await deliveryOf(u.id);
      let calls = 0;
      const slowOk = async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 30));
        return { statusCode: 201 };
      };
      await Promise.all(Array.from({ length: 5 }, () => push.attemptPushDelivery(d.id, { now: BDAY_NOON, configured: true, sender: slowOk })));
      expect(calls).toBe(2);
      expect((await deliveryOf(u.id)).status).toBe("ACCEPTED");
    });

    it("forgets subscriptions the browser dropped (410) and gives up after 5 attempts", async () => {
      const u = await granted();
      const s1 = await sub(u.id, 1);
      await sub(u.id, 2);
      const d = await deliveryOf(u.id);
      const sender = async (t: { endpoint: string }) => ({ statusCode: t.endpoint === s1.endpoint ? 410 : 503 });
      let now = BDAY_NOON;
      let status: string | null = null;
      for (let i = 0; i < 5; i++) {
        status = await push.attemptPushDelivery(d.id, { now, configured: true, sender });
        now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      }
      expect(status).toBe("FAILED");
      expect(await db.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
      expect((await deliveryOf(u.id)).attempts).toBe(5);
      expect(await push.attemptPushDelivery(d.id, { now, configured: true, sender })).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  describe("expiry reminder", () => {
    it("is queued once, 3 days before expiry, only with coins left", async () => {
      const u = await granted();
      const reward = await db.birthdayReward.findFirstOrThrow({ where: { userId: u.id } });
      const tooEarly = new Date(reward.expiresAt.getTime() - 4 * DAY);
      expect(await birthday.queueBirthdayExpiryReminder(reward.id, { now: tooEarly, deliver: false })).toBe(false);

      const due = new Date(reward.expiresAt.getTime() - 2 * DAY);
      const results = await Promise.all(Array.from({ length: 4 }, () => birthday.queueBirthdayExpiryReminder(reward.id, { now: due, deliver: false })));
      expect(results.filter(Boolean)).toHaveLength(1);
      const notes = await db.notification.findMany({ where: { userId: u.id, type: "BIRTHDAY_REWARD_EXPIRING" } });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.body).toContain("1,500 birthday Proggy Coins");
      expect(await db.notificationDelivery.count({ where: { userId: u.id, dedupeKey: `birthday-expiry:${reward.id}` } })).toBe(1);

      const spentAll = await granted();
      await coins.adjustCoinsAsAdmin(spentAll.id, -1500, "spent");
      const r2 = await db.birthdayReward.findFirstOrThrow({ where: { userId: spentAll.id } });
      expect(await birthday.queueBirthdayExpiryReminder(r2.id, { now: new Date(r2.expiresAt.getTime() - DAY), deliver: false })).toBe(false);
      expect(await db.notification.count({ where: { userId: spentAll.id, type: "BIRTHDAY_REWARD_EXPIRING" } })).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  describe("signed-in fallback, celebration and privacy", () => {
    it("a page load on the birthday grants lazily and returns the celebration until it is acknowledged", async () => {
      const u = await student(DOB, { coins: 10 });
      const first = await birthday.runBirthdayChecksForUser(u, BDAY_NOON);
      expect(first.needsDateOfBirth).toBe(false);
      expect(first.celebration).toMatchObject({ amount: 1500, year: YEAR, name: `Nadia ${tag}` });
      expect(await balance(u.id)).toBe(1510);

      // Refreshing or another device: still shown until dismissed, never granted twice.
      expect((await birthday.runBirthdayChecksForUser(u, new Date(BDAY_NOON.getTime() + 60_000))).celebration?.rewardId).toBe(first.celebration!.rewardId);
      expect(await balance(u.id)).toBe(1510);

      // Someone else can't dismiss it; not signed in throws.
      const other = await student(null);
      session.user = { id: other.id, role: "STUDENT" };
      await actions.acknowledgeBirthdayCelebrationAction(first.celebration!.rewardId);
      expect((await db.birthdayReward.findUniqueOrThrow({ where: { id: first.celebration!.rewardId } })).celebrationSeenAt).toBeNull();
      session.user = null;
      await expect(actions.acknowledgeBirthdayCelebrationAction(first.celebration!.rewardId)).rejects.toThrow(/session/);

      // The owner dismisses it: persisted, and the coins are untouched.
      session.user = { id: u.id, role: "STUDENT" };
      expect(await actions.acknowledgeBirthdayCelebrationAction(first.celebration!.rewardId)).toEqual({ ok: true });
      expect((await birthday.runBirthdayChecksForUser(u, new Date(BDAY_NOON.getTime() + 120_000))).celebration).toBeNull();
      expect(await balance(u.id)).toBe(1510);
      session.user = null;
    });

    it("flags students without a date of birth (non-blocking reminder)", async () => {
      const u = await student(null);
      expect(await birthday.runBirthdayChecksForUser(u, BDAY_NOON)).toEqual({ celebration: null, needsDateOfBirth: true });
    });

    it("the overview never contains the date of birth itself", async () => {
      const u = await granted();
      const overview = await birthday.getBirthdayOverview(u.id, BDAY_NOON);
      expect(JSON.stringify(overview)).not.toContain("2008");
      expect(overview).toMatchObject({ hasDateOfBirth: true, isBirthdayToday: true, todayYear: YEAR });
      expect(overview.rewards[0]).toMatchObject({ amount: 1500, remaining: 1500 });
    });

    it("push subscriptions: validated, owned by the caller, removable only by the owner", async () => {
      const u = await student(null);
      const v = await student(null);
      const endpoint = `https://push.example.com/${tag}/owned`;
      session.user = { id: u.id, role: "STUDENT" };
      expect(await actions.savePushSubscriptionAction({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } })).toMatchObject({ ok: false });
      expect(await actions.savePushSubscriptionAction({ endpoint, keys: { p256dh: "B".repeat(87), auth: "abcdefghijklmnopqrstuv" } })).toEqual({ ok: true });
      session.user = { id: v.id, role: "STUDENT" };
      await actions.removePushSubscriptionAction(endpoint);
      expect(await db.pushSubscription.count({ where: { endpoint, userId: u.id } })).toBe(1);
      session.user = { id: u.id, role: "STUDENT" };
      await actions.removePushSubscriptionAction(endpoint);
      expect(await db.pushSubscription.count({ where: { endpoint } })).toBe(0);
      session.user = null;
    });
  });

  // ------------------------------------------------------------------
  describe("scheduled job", () => {
    it("grants today's birthdays, is idempotent across runs, and leaves others alone", async () => {
      const day = new Date("2026-06-20T19:00:00Z"); // 01:00 Dhaka, June 21
      const today = await student("2009-06-21");
      const utcDay = await student("2009-06-20"); // June 20 is the UTC date but not the Dhaka date
      const first = await birthday.runBirthdayJob(day);
      expect(first.granted).toBeGreaterThanOrEqual(1);
      const second = await birthday.runBirthdayJob(new Date(day.getTime() + 60 * 60 * 1000));
      expect(second.granted).toBe(0);
      expect(await db.birthdayReward.count({ where: { userId: today.id } })).toBe(1);
      expect(await db.birthdayReward.count({ where: { userId: utcDay.id } })).toBe(0);
      expect(await balance(today.id)).toBe(1500);
      // Push not configured in tests: queued then recorded as SKIPPED, never as sent.
      expect((await db.notificationDelivery.findFirstOrThrow({ where: { userId: today.id } })).status).toBe("SKIPPED");
    });
  });
});
