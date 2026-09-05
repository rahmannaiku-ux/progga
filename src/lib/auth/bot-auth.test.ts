import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { constantTimeEquals, requireBotApiKey } from "./bot-auth";

describe("constantTimeEquals", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEquals("secret-key-123", "secret-key-123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEquals("secret-key-123", "secret-key-124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(constantTimeEquals("short", "a-much-longer-string")).toBe(false);
  });

  it("returns false for an empty guess against a real key", () => {
    expect(constantTimeEquals("", "secret-key-123")).toBe(false);
  });
});

describe("requireBotApiKey", () => {
  const ORIGINAL_KEY = process.env.PROGGAA_API_KEY;

  beforeEach(() => {
    process.env.PROGGAA_API_KEY = "test-bot-api-key";
  });

  afterEach(() => {
    process.env.PROGGAA_API_KEY = ORIGINAL_KEY;
  });

  it("accepts a request with the correct X-Api-Key header", () => {
    const req = new Request("https://example.com/api/bot/users/u1", {
      headers: { "x-api-key": "test-bot-api-key" },
    });
    const result = requireBotApiKey(req);
    expect(result.ok).toBe(true);
  });

  it("rejects a request with a wrong key", async () => {
    const req = new Request("https://example.com/api/bot/users/u1", {
      headers: { "x-api-key": "wrong-key" },
    });
    const result = requireBotApiKey(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(401);
  });

  it("rejects a request with no key at all", () => {
    const req = new Request("https://example.com/api/bot/users/u1");
    const result = requireBotApiKey(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(401);
  });

  it("fails closed (503) when PROGGAA_API_KEY itself is unset", () => {
    delete process.env.PROGGAA_API_KEY;
    const req = new Request("https://example.com/api/bot/users/u1", {
      headers: { "x-api-key": "anything" },
    });
    const result = requireBotApiKey(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(503);
  });
});
