import { formatDhakaDateTimeBST } from "@/lib/timezone";

/**
 * The fixed terms of the birthday reward. Server-side only values: nothing
 * here is ever read from a request, so a client can't change the amount
 * or the expiry.
 */
export const BIRTHDAY_REWARD_COINS = 1500;
export const BIRTHDAY_REWARD_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const BIRTHDAY_REWARD_TTL_MS = BIRTHDAY_REWARD_TTL_DAYS * DAY_MS;
/** The "expires soon" reminder goes out once, this many days before expiry. */
export const BIRTHDAY_EXPIRY_REMINDER_DAYS = 3;
export const BIRTHDAY_EXPIRY_REMINDER_MS = BIRTHDAY_EXPIRY_REMINDER_DAYS * DAY_MS;

export const DATE_OF_BIRTH_PRIVACY_NOTE =
  "Only used for birthday greetings and your birthday reward. It's never shown on your public profile.";

/** Where the notification and banners send the student (signed-in page). */
export const BIRTHDAY_PAGE_PATH = "/birthday";

/** Unique per student per birthday year; stored on BirthdayReward and used as the ledger sourceId. */
export function birthdayIdempotencyKey(userId: string, year: number): string {
  return `birthday:${userId}:${year}`;
}

export function birthdayRewardReason(year: number): string {
  return `Birthday Reward — ${year}`;
}

/** Grant and expiry are exactly 30 days (720 hours) apart. */
export function birthdayRewardExpiry(grantedAt: Date): Date {
  return new Date(grantedAt.getTime() + BIRTHDAY_REWARD_TTL_MS);
}

/** Only the first name: no surname, age, date of birth or balance in a message that can show on a lock screen. */
export function greetingName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 40) || "Hero";
}

export function birthdayNotification(name: string) {
  return {
    title: "Happy birthday from Proggaa",
    body:
      `Happy Birthday, ${greetingName(name)}! Celebrate your special day with ` +
      `${BIRTHDAY_REWARD_COINS.toLocaleString("en-US")} Proggy Coins. Your birthday reward expires in ` +
      `${BIRTHDAY_REWARD_TTL_DAYS} days, so enjoy it before it expires. Here's to a new year of learning, ` +
      `growth, and exciting Missions!`,
    linkUrl: BIRTHDAY_PAGE_PATH,
  };
}

export function birthdayExpiryReminderNotification(remaining: number, expiresAt: Date) {
  return {
    title: "⏳ Your birthday coins expire soon",
    body:
      `You still have ${remaining.toLocaleString("en-US")} birthday Proggy Coins. ` +
      `They expire on ${formatDhakaDateTimeBST(expiresAt)}. Spend them in the Proggy Store before then!`,
    linkUrl: BIRTHDAY_PAGE_PATH,
  };
}

export type BirthdayRewardStatus = "active" | "spent" | "expired";

export function birthdayRewardStatus(
  reward: { expiresAt: Date; remaining: number; expiredAt: Date | null },
  now: Date = new Date()
): BirthdayRewardStatus {
  if (reward.expiredAt || now.getTime() >= reward.expiresAt.getTime()) return "expired";
  if (reward.remaining <= 0) return "spent";
  return "active";
}

/** True when the expiry reminder is due now: inside the reminder window and not expired yet. */
export function isExpiryReminderDue(expiresAt: Date, now: Date = new Date()): boolean {
  const left = expiresAt.getTime() - now.getTime();
  return left > 0 && left <= BIRTHDAY_EXPIRY_REMINDER_MS;
}
