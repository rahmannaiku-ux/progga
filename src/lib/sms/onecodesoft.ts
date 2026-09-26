/**
 * SMS provider abstraction. The OTP service (src/lib/auth/otp.ts) only
 * ever talks to the `SmsProvider` interface below — it has zero
 * knowledge of Onecodesoft, or of whatever provider replaces it later.
 *
 * ============================================================================
 * PHASE 5: real Onecodesoft implementation, sourced from the vendor's own
 * WordPress plugin ("Bulk SMS Gateway by Onecodesoft" — the supplied
 * bulk-sms-by-onecodesoft.zip), specifically includes/class-bulk-sms-api.php.
 * That file is the authoritative reference for everything below; nothing
 * here is guessed. See the Phase 5 report for the full audit and for
 * exactly which details (if any) could NOT be confirmed from the plugin.
 * ============================================================================
 */

const ONECODESOFT_DEFAULT_BASE_URL = "https://sms.onecodesoft.com/api";
const REQUEST_TIMEOUT_MS = 45_000; // matches the plugin's own `timeout => 45` (seconds, in WP's wp_remote_request)

export interface SmsProvider {
  /**
   * Sends `message` to `phone` (canonical "+8801XXXXXXXXX" form — see
   * src/lib/auth/phone.ts). Must throw on any failure to send; must
   * never resolve successfully without the provider actually accepting
   * the message for delivery. Server-side only — never call from a
   * client component or expose this module to the browser.
   */
  sendSms(phone: string, message: string): Promise<void>;
}

export class SmsProviderNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Onecodesoft SMS provider is not configured: ${missing} is not set.`);
    this.name = "SmsProviderNotConfiguredError";
  }
}

export class OnecodesoftSendError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "OnecodesoftSendError";
  }
}

/**
 * Converts our internal canonical phone form ("+8801XXXXXXXXX", see
 * src/lib/auth/phone.ts) to the exact format the Onecodesoft API
 * expects: "880XXXXXXXXXX" — 13 digits, no leading "+". Confirmed by
 * the plugin's own `validate_number()` (public/class-bulk-sms-public.php),
 * which normalizes every input format to this same 13-digit shape
 * before sending, and by its README ("Smart Number Formatting...
 * 880XXXXXXXXXX"). This is a request-shaping detail specific to this
 * one provider — it does NOT change our own canonical format, and
 * nothing outside this file needs to know about it.
 */
function toOnecodesoftPhoneFormat(canonicalPhone: string): string {
  return canonicalPhone.startsWith("+") ? canonicalPhone.slice(1) : canonicalPhone;
}

/**
 * The plugin's success/failure signal is entirely response-body-based,
 * never HTTP-status-based — its own `request()` method returns the
 * response body even for non-2xx statuses specifically so the caller
 * can inspect it ("return $body; // Return body anyway so we can see
 * the error"), and both of its own success checks
 * (`Bulk_Sms_Public::is_sms_success` and
 * `Bulk_Sms_Background::is_success`) only ever look at the decoded
 * JSON body's `message` field — never at `wp_remote_retrieve_response_code`.
 * Mirrored here for the same reason: whatever HTTP status Onecodesoft
 * returns, the real answer is in the body.
 */
function isSuccessResponse(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (typeof obj.message === "string" && obj.message.toLowerCase().includes("success")) return true;
  // The plugin's public-facing success check (but not its background-job
  // one) also accepts a `results` array as a secondary success signal —
  // both vendor files exist in the same plugin and aren't fully
  // consistent with each other; kept here as a permissive OR rather than
  // silently picking one, since a false negative (reporting a real send
  // as failed) is worse than a false positive here.
  if (Array.isArray(obj.results)) return true;
  return false;
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && typeof (body as Record<string, unknown>).message === "string") {
    return (body as Record<string, unknown>).message as string;
  }
  return "Onecodesoft did not report a specific error.";
}

class OnecodesoftProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<void> {
    const apiKey = process.env.ONECODESOFT_API_KEY;
    if (!apiKey) throw new SmsProviderNotConfiguredError("ONECODESOFT_API_KEY");

    const baseUrl = process.env.ONECODESOFT_API_URL || ONECODESOFT_DEFAULT_BASE_URL;
    const senderId = process.env.ONECODESOFT_SENDER_ID?.trim() || "";

    // Body shape confirmed by class-bulk-sms-api.php's send(): a single
    // top-level JSON object with api_key, senderid, and a
    // MessageParameters array of {Number, Text} — even for one
    // recipient, it's still a one-element array, not a bare object.
    const payload = {
      api_key: apiKey,
      senderid: senderId,
      MessageParameters: [{ Number: toOnecodesoftPhoneFormat(phone), Text: message }],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/send-bulk-sms`, {
        method: "POST",
        headers: {
          // Exact header set from the plugin's request() — no
          // Authorization header; the API key travels in the JSON body.
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      // Network failure / timeout — never silently treated as success.
      // Message deliberately generic; the real cause (including
      // anything that might echo back request details) stays out of
      // what a caller further up the stack could ever surface.
      throw new OnecodesoftSendError("Failed to reach the Onecodesoft SMS API.", err);
    } finally {
      clearTimeout(timeout);
    }

    let body: unknown;
    const rawText = await res.text();
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      throw new OnecodesoftSendError("Onecodesoft returned a response that could not be parsed.", err);
    }

    if (!isSuccessResponse(body)) {
      throw new OnecodesoftSendError(`Onecodesoft reported the SMS was not sent: ${extractErrorMessage(body)}`);
    }
    // Success — nothing to return; the interface is fire-and-confirm,
    // not fire-and-forget (a thrown error above IS the failure signal).
  }
}

let cachedProvider: SmsProvider | null = null;

/** Returns the configured SMS provider singleton. Server-only. */
export function getSmsProvider(): SmsProvider {
  if (!cachedProvider) cachedProvider = new OnecodesoftProvider();
  return cachedProvider;
}
