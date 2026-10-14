/* eslint-disable no-console -- the designated audit sink for reward grants, coin expiry and phone delivery; call logReward() instead of console */
/**
 * Structured audit log lines for birthday rewards, reward-coin expiry and
 * phone delivery. Ids and counts only: never names, phone numbers, dates of
 * birth or push endpoints. The database rows (ledger, BirthdayReward,
 * CoinRewardLot, NotificationDelivery) remain the authoritative record.
 */
export function logReward(event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  console.info(JSON.stringify({ ts: new Date().toISOString(), scope: "rewards", event, ...fields }));
}
