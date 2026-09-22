import { describe, expect, it } from "vitest";
import { signWebhookPayload } from "./webhooks";

describe("signWebhookPayload", () => {
  it("produces a 64-char lowercase hex HMAC-SHA256 digest", () => {
    expect(signWebhookPayload("secret", '{"a":1}')).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is deterministic for the same secret and body", () => {
    expect(signWebhookPayload("secret", '{"a":1}')).toBe(signWebhookPayload("secret", '{"a":1}'));
  });
  it("changes when the secret changes", () => {
    expect(signWebhookPayload("secret", '{"a":1}')).not.toBe(signWebhookPayload("other", '{"a":1}'));
  });
  it("changes when the body changes", () => {
    expect(signWebhookPayload("secret", '{"a":1}')).not.toBe(signWebhookPayload("secret", '{"a":2}'));
  });
});
