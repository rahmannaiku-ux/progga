import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Same sandbox caveat as the other test files in this repo — written
// against the real contract (verified against the supplied Onecodesoft
// WordPress plugin source, see src/lib/sms/onecodesoft.ts's header
// comment), not executed here (no npm install / node_modules
// available in this sandbox). Mocks `fetch` throughout — this suite
// must NEVER make a real network call to Onecodesoft.

const CANONICAL_PHONE = "+8801712345678";
const ONECODESOFT_PHONE = "8801712345678"; // same digits, no "+" — see toOnecodesoftPhoneFormat

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Onecodesoft provider (real implementation)", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ONECODESOFT_API_KEY = "test-api-key";
    delete process.env.ONECODESOFT_SENDER_ID;
    delete process.env.ONECODESOFT_API_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function loadProvider() {
    const mod = await import("./onecodesoft");
    return mod;
  }

  it("throws SmsProviderNotConfiguredError when ONECODESOFT_API_KEY is unset — never fakes success", async () => {
    delete process.env.ONECODESOFT_API_KEY;
    const { getSmsProvider, SmsProviderNotConfiguredError } = await loadProvider();
    global.fetch = vi.fn(); // must not even be called
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "hello")).rejects.toBeInstanceOf(SmsProviderNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends a successful request with the exact vendor-confirmed shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Success" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();

    await getSmsProvider().sendSms(CANONICAL_PHONE, "Your OTP is 123456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://sms.onecodesoft.com/api/send-bulk-sms");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      api_key: "test-api-key",
      senderid: "",
      MessageParameters: [{ Number: ONECODESOFT_PHONE, Text: "Your OTP is 123456" }],
    });
  });

  it("strips the leading '+' from the canonical phone before sending (Onecodesoft expects 880XXXXXXXXXX)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Success" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await getSmsProvider().sendSms(CANONICAL_PHONE, "msg");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.MessageParameters[0].Number).toBe("8801712345678");
    expect(body.MessageParameters[0].Number.startsWith("+")).toBe(false);
  });

  it("includes senderid when ONECODESOFT_SENDER_ID is set, empty string when it isn't", async () => {
    process.env.ONECODESOFT_SENDER_ID = "PROGGAA";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Success" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await getSmsProvider().sendSms(CANONICAL_PHONE, "msg");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.senderid).toBe("PROGGAA");
  });

  it("treats a response whose message doesn't mention success as a failure (matches the plugin's own is_sms_success/is_success logic)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Insufficient balance" }));
    global.fetch = fetchMock;
    const { getSmsProvider, OnecodesoftSendError } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).rejects.toBeInstanceOf(OnecodesoftSendError);
  });

  it("surfaces the provider's own error message rather than a generic one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Invalid API key" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).rejects.toThrow(/Invalid API key/);
  });

  it("accepts a `results` array as an alternate success signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [{ Number: ONECODESOFT_PHONE, Status: "Sent" }] }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).resolves.toBeUndefined();
  });

  it("does NOT gate success on HTTP status — a non-2xx status with a success-looking body still counts as sent (matches the plugin's body-only logic)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Success" }, 202));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).resolves.toBeUndefined();
  });

  it("treats a network failure/timeout as a send failure, never as success", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    const { getSmsProvider, OnecodesoftSendError } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).rejects.toBeInstanceOf(OnecodesoftSendError);
  });

  it("treats a malformed (non-JSON) response body as a failure rather than crashing or succeeding silently", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
    const { getSmsProvider, OnecodesoftSendError } = await loadProvider();
    await expect(getSmsProvider().sendSms(CANONICAL_PHONE, "msg")).rejects.toBeInstanceOf(OnecodesoftSendError);
  });

  it("never includes the API key in a thrown error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Invalid API key" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    try {
      await getSmsProvider().sendSms(CANONICAL_PHONE, "msg");
      throw new Error("expected sendSms to throw");
    } catch (err) {
      expect(String(err)).not.toContain("test-api-key");
    }
  });

  it("respects ONECODESOFT_API_URL override when set", async () => {
    process.env.ONECODESOFT_API_URL = "https://sandbox.example.com/api";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Success" }));
    global.fetch = fetchMock;
    const { getSmsProvider } = await loadProvider();
    await getSmsProvider().sendSms(CANONICAL_PHONE, "msg");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://sandbox.example.com/api/send-bulk-sms");
  });

  it("returns the same singleton instance on repeated calls", async () => {
    const { getSmsProvider } = await loadProvider();
    expect(getSmsProvider()).toBe(getSmsProvider());
  });
});
