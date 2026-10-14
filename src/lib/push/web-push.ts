import webpush from "web-push";

/**
 * Web Push (VAPID) sender. Works for any browser that supports the Push API:
 * Chrome/Edge/Firefox/Samsung Internet on Android (no install needed), and
 * Safari on iPhone/iPad only when Proggaa is added to the Home Screen
 * (iOS 16.4+). Free: the browsers' own push services carry the message.
 *
 * Configuration (server): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT ("mailto:..." or the site URL). The same public key must be
 * exposed to the browser as NEXT_PUBLIC_VAPID_PUBLIC_KEY. Generate a pair
 * once with `npx web-push generate-vapid-keys`. Changing the pair
 * invalidates every existing subscription.
 */

export function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushSendResult = { statusCode: number; error?: string };

/** Sends one encrypted payload. Never throws: a failure comes back as a status code (0 = no HTTP answer). */
export async function sendWebPush(target: PushTarget, payload: string): Promise<PushSendResult> {
  const vapid = getVapidConfig();
  if (!vapid) return { statusCode: 0, error: "Web push is not configured." };
  try {
    const res = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      { vapidDetails: vapid, TTL: 24 * 60 * 60, timeout: 10_000, urgency: "normal" }
    );
    return { statusCode: res.statusCode };
  } catch (err) {
    if (err instanceof webpush.WebPushError) {
      return { statusCode: err.statusCode, error: (err.body || err.message || "").slice(0, 200) };
    }
    return { statusCode: 0, error: err instanceof Error ? err.name : "network error" };
  }
}
