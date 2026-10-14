import { describe, expect, it } from "vitest";
import {
  MAX_PUSH_ATTEMPTS,
  buildPushPayload,
  endpointHost,
  parsePushSubscription,
  pushRetryDelayMs,
  summarizePushAttempt,
} from "./delivery-rules";

const dev = (id: string, statusCode: number) => ({ subscriptionId: id, host: "fcm.googleapis.com", statusCode });

describe("summarizePushAttempt", () => {
  it("is SKIPPED, not sent, when no device opted in", () => {
    expect(summarizePushAttempt([], 1)).toMatchObject({ status: "SKIPPED" });
  });

  it("is ACCEPTED (never 'delivered') when any push service accepted it", () => {
    const out = summarizePushAttempt([dev("a", 201), dev("b", 500)], 1);
    expect(out.status).toBe("ACCEPTED");
    expect(out.response).toContain("201");
  });

  it("retries transient failures with backoff, then FAILED", () => {
    const first = summarizePushAttempt([dev("a", 500)], 1);
    expect(first).toMatchObject({ status: "PENDING", retryInMs: 60_000 });
    expect(summarizePushAttempt([dev("a", 0)], 2)).toMatchObject({ status: "PENDING", retryInMs: 300_000 });
    expect(summarizePushAttempt([dev("a", 503)], MAX_PUSH_ATTEMPTS)).toMatchObject({ status: "FAILED" });
  });

  it("drops gone subscriptions (404/410) and skips when all are gone", () => {
    const out = summarizePushAttempt([dev("a", 410), dev("b", 404)], 1);
    expect(out.status).toBe("SKIPPED");
    expect(out.gone).toEqual(["a", "b"]);
    const mixed = summarizePushAttempt([dev("a", 410), dev("b", 201)], 1);
    expect(mixed.status).toBe("ACCEPTED");
    expect(mixed.gone).toEqual(["a"]);
  });

  it("caps backoff at 6 hours", () => {
    expect(pushRetryDelayMs(20)).toBe(6 * 60 * 60 * 1000);
  });
});

describe("buildPushPayload", () => {
  it("contains only title, body, a same-site path and tag", () => {
    const payload = JSON.parse(buildPushPayload({ title: "T", body: "B", linkUrl: "/birthday", tag: "proggaa-d1" }));
    expect(Object.keys(payload).sort()).toEqual(["body", "tag", "title", "url"]);
    expect(payload.url).toBe("/birthday");
  });

  it("never links off-site", () => {
    expect(JSON.parse(buildPushPayload({ title: "T", body: "B", linkUrl: "https://evil.example", tag: "x" })).url).toBe("/notifications");
    expect(JSON.parse(buildPushPayload({ title: "T", body: "B", linkUrl: "//evil.example", tag: "x" })).url).toBe("/notifications");
  });
});

describe("parsePushSubscription", () => {
  const good = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: { p256dh: "B".repeat(87), auth: "abcdefghijklmnopqrstuv" },
  };

  it("accepts a browser subscription", () => {
    expect(parsePushSubscription(good)).toMatchObject({ ok: true });
  });

  it.each([
    [{ ...good, endpoint: "http://insecure.example/x" }],
    [{ ...good, endpoint: "not a url" }],
    [{ ...good, keys: { ...good.keys, p256dh: "short" } }],
    [{ ...good, keys: { ...good.keys, auth: "bad key!" } }],
    [null],
    ["string"],
  ])("rejects %j", (input) => {
    expect(parsePushSubscription(input).ok).toBe(false);
  });

  it("logs only the push service host, not the endpoint capability URL", () => {
    expect(endpointHost(good.endpoint)).toBe("fcm.googleapis.com");
  });
});
