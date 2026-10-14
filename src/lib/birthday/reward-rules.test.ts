import { describe, expect, it } from "vitest";
import {
  BIRTHDAY_REWARD_COINS,
  BIRTHDAY_REWARD_TTL_MS,
  birthdayExpiryReminderNotification,
  birthdayIdempotencyKey,
  birthdayNotification,
  birthdayRewardExpiry,
  birthdayRewardReason,
  birthdayRewardStatus,
  greetingName,
  isExpiryReminderDue,
} from "./reward-rules";

describe("birthday reward terms", () => {
  it("is exactly 1,500 coins", () => {
    expect(BIRTHDAY_REWARD_COINS).toBe(1500);
  });

  it("expires exactly 30 days (720 hours) after the grant", () => {
    const granted = new Date("2026-03-14T18:00:05.123Z");
    const expires = birthdayRewardExpiry(granted);
    expect(expires.getTime() - granted.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(BIRTHDAY_REWARD_TTL_MS).toBe(2_592_000_000);
    expect(expires.toISOString()).toBe("2026-04-13T18:00:05.123Z");
  });

  it("has one idempotency key per student per year", () => {
    expect(birthdayIdempotencyKey("u1", 2026)).toBe("birthday:u1:2026");
    expect(birthdayIdempotencyKey("u1", 2027)).not.toBe(birthdayIdempotencyKey("u1", 2026));
    expect(birthdayIdempotencyKey("u2", 2026)).not.toBe(birthdayIdempotencyKey("u1", 2026));
  });

  it("labels the ledger row with the year", () => {
    expect(birthdayRewardReason(2026)).toBe("Birthday Reward — 2026");
  });
});

describe("notification text", () => {
  it("greets by first name and states amount, expiry and link", () => {
    const n = birthdayNotification("Ayesha Rahman Khan");
    expect(n.title).toBe("🎂 Happy Birthday from Proggaa!");
    expect(n.body).toContain("Happy Birthday, Ayesha!");
    expect(n.body).toContain("1,500 Proggy Coins");
    expect(n.body).toContain("expires in 30 days");
    expect(n.linkUrl).toBe("/birthday");
  });

  it("never includes the surname, phone, date of birth or age", () => {
    const n = birthdayNotification("Ayesha Rahman");
    const text = `${n.title} ${n.body}`;
    expect(text).not.toContain("Rahman");
    expect(text).not.toMatch(/\+?880|\b01\d{9}\b/);
    expect(text).not.toMatch(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
    expect(text).not.toMatch(/\byears? old\b|\bturn(ed|ing)? \d+/i);
  });

  it("falls back to 'Hero' without a name", () => {
    expect(greetingName("")).toBe("Hero");
    expect(greetingName(null)).toBe("Hero");
    expect(greetingName("   ")).toBe("Hero");
  });

  it("expiry reminder shows the remaining coins and the Dhaka expiry time", () => {
    const n = birthdayExpiryReminderNotification(700, new Date("2026-04-13T18:00:00Z"));
    expect(n.body).toContain("700 birthday Proggy Coins");
    expect(n.body).toContain("April 14, 2026 · 12:00 AM BST");
  });
});

describe("status and reminder timing", () => {
  const expiresAt = new Date("2026-04-13T18:00:00Z");

  it("is active, spent or expired", () => {
    expect(birthdayRewardStatus({ expiresAt, remaining: 10, expiredAt: null }, new Date("2026-04-01T00:00:00Z"))).toBe("active");
    expect(birthdayRewardStatus({ expiresAt, remaining: 0, expiredAt: null }, new Date("2026-04-01T00:00:00Z"))).toBe("spent");
    expect(birthdayRewardStatus({ expiresAt, remaining: 10, expiredAt: null }, expiresAt)).toBe("expired");
    expect(birthdayRewardStatus({ expiresAt, remaining: 0, expiredAt: expiresAt }, new Date("2026-04-01T00:00:00Z"))).toBe("expired");
  });

  it("reminder is due only within the last 3 days before expiry", () => {
    expect(isExpiryReminderDue(expiresAt, new Date("2026-04-10T17:59:59Z"))).toBe(false);
    expect(isExpiryReminderDue(expiresAt, new Date("2026-04-10T18:00:00Z"))).toBe(true);
    expect(isExpiryReminderDue(expiresAt, new Date("2026-04-13T17:59:59Z"))).toBe(true);
    expect(isExpiryReminderDue(expiresAt, expiresAt)).toBe(false);
  });
});
