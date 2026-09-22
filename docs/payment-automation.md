# Proggaa SMS payment automation — design & status

**Principle:** SMS is *evidence*, not proof. The Android phone is an *observation agent*; the Proggaa backend is the *authority*. This is an **additional verification source** on the existing payment system — there is no second payment system.

## 1. What already existed (kept intact)

| Existing | Where | Status |
|---|---|---|
| `Payment` (order): `PENDING → AWAITING_VERIFICATION → PAID / REJECTED / EXPIRED / CANCELLED` | `prisma/schema.prisma` | Extended, not replaced |
| Price derived server-side, `CourseDiscount`, `CourseCoupon`/`CouponRedemption` (race-safe) | `payment-actions.ts`, `lib/payments/*` | Untouched |
| Student checkout `/payments/[id]`, TrxID submit, invoice page | `app/(hero)/payments/**` | Untouched (SMS hooks added server-side only) |
| Enrollment creation inside the payment transaction | `markPaidAndEnroll` | **Moved** to `server/services/payment-verification.ts` (same logic) |
| Admin verify/reject, `/admin/payments`, Telegram bot approve/reject | `payment-actions.ts`, `api/bot/payments/**` | Untouched |
| `SiteSettings.autoVerifyPayments` kill switch | `SiteSettings` | Still gates automatic verification |
| Legacy bridge `POST /api/payment-bridge/bkash` (bearer token) | `api/payment-bridge/bkash` | Untouched (only its import path changed) |
| `PaymentBridgeDevice` (hashed token, revocable) | schema | Extended with app-registration columns |
| Upstash rate limiter with in-memory fallback | `lib/rate-limit.ts` | Two buckets added (`device`, `lookup`) |
| Clerk auth, `requireAdminUser`, `ActivityLog` | — | Reused |

## 2. Spec model → implementation mapping

| Spec | Implemented as |
|---|---|
| PaymentOrder | existing `Payment` (+ `mfsProvider`, `receivingNumber`, `publicId`, `idempotencyKey`) |
| Payment states PENDING/COMPLETED/EXECUTED/… | existing `PaymentStatus` (`PAID` ≙ COMPLETED). Transition table in `lib/payments/sms/state-machine.ts`. EXECUTED (post-fulfilment) is not modelled — enrollment is atomic with `PAID`. |
| PaymentDevice | existing `PaymentBridgeDevice` (+ `installId`, `appVersion`, `androidVersion`, `lastSyncAt`, registration-code columns) |
| PaymentTransaction | new `PaymentTransaction`, unique `(provider, transactionId)` |
| PaymentConfiguration | new `PaymentConfiguration` (per-provider receiving number; `SiteSettings.bkashNumber` remains the bKash fallback) |
| ProviderConfiguration + ProviderSenderRule + ProviderParserRule | one immutable, versioned `ProviderConfiguration` row holding `{senderRules, parserRules}` + `rulesHash`. Separate rule tables would only duplicate it. |
| PaymentAuditLog / PaymentWebhook | new `PaymentAuditLog` (append-only), new `PaymentWebhook` outbox (delivery worker not yet built) |
| Replay protection | new `DeviceRequestNonce` unique `(deviceId, requestId)` |
| Verification source | `VerificationMethod.AUTOMATIC_SMS` (new). `AUTOMATIC_API` is reserved for a genuine provider API — SMS never claims it. |

## 3. Trust model (as implemented)

0 unknown SMS · 1 recognised sender + valid structure (device-reported) · 2 server-validated normalized transaction · 3 matched to an order (receiver+amount+provider+window+hint) · 4 backend verified · 5 official provider API (**not implemented; nothing may set it**).

SMS evidence can never exceed level 4. The device can never emit `AUTHENTIC`; `LIKELY_AUTHENTIC` is its ceiling.

## 4. Rollout ("gradually make it the primary automatic verifier")

`SiteSettings.smsAutoVerifyMode` (default **SHADOW**):

- `OFF` — device transactions are stored as evidence only.
- `SHADOW` — full matching runs and is audited, admins are told "matched (shadow)", **nobody is enrolled**. Compare the audit trail against your manual verifications for as long as you like.
- `ENFORCE` — a fully-matched, low-risk transaction verifies + enrolls, **still gated by** `autoVerifyPayments`.

Manual verification (admin UI / Telegram bot) works in every mode and, when it verifies an order that has matched SMS evidence, marks that evidence `VERIFIED` so it can't be reused.

## 5. Matching rules (`lib/payments/sms/matching.ts`)

The student's TrxID is only a hint that selects the candidate order. A transaction verifies an order only if **all** hold: no hard failure · not already matched · order is `AWAITING_VERIFICATION` · same provider · receiver equals the snapshotted number (or is absent from the SMS — recorded as unchecked, adds risk) · amount equal in exact minor units · transaction time within `[order.createdAt − 5 min, expiry + 30 min]` · payer number equals the student's if they gave one · risk score ≤ 30 · mode `ENFORCE` · kill switch on. Anything else → `MISMATCH`/`AMBIGUOUS`/`BLOCKED` → human review. Never matches on amount alone.

If the SMS arrives *before* the student submits the TrxID it stays `OBSERVED`; `submitBkashTxid` triggers matching immediately afterwards.

## 6. Device protocol (HTTPS only)

`POST /api/payment/device/register` (one-time code → per-device credential, hash stored) ·
`GET /config` · `POST /transactions` (≤50, **no SMS bodies**) · `POST /heartbeat`.
Every authenticated call: bearer credential → device active (revocation effective immediately, `403 DEVICE_REVOKED`) → per-device rate limit → `X-Timestamp` within ±5 min → unique `X-Request-Id` (replay ledger). Per-transaction `ACK`; the app deletes a queue item only after ACK.

## 7. What is deliberately NOT guessed

No provider's real sender ID or SMS wording is shipped. Rules are authored by an admin from real messages on their own phone and stay disabled until enabled (`ProviderConfiguration.enabled = false` by default). Test fixtures are synthetic (`lib/payments/sms/fixtures.ts`). Sender IDs can be spoofed on some networks, so sender validation is one weak signal among several, not authentication.

## 8. Known limitation of SMS-only evidence

The server sees only what the authenticated device reports. A compromised/rooted registered phone could report false transactions. Mitigations: per-device revocation, SHADOW rollout, risk gating, audit trail, optional manual review. Only an official merchant API (level 5) removes this — design leaves room for it as a separate evidence source.

## 9. Android app (apps/payment-android)

Kotlin/Compose/Room/WorkManager/Retrofit companion using ONLY the device routes above. Written but **not yet
compiled or run** (no Android SDK/Gradle/network where it was authored) — see `apps/payment-android/README.md`.
Cross-checks that *were* run: the Kotlin rule engine's expected outputs are generated from the TypeScript reference
engine; the configuration hash algorithm reproduces the backend's hashes (separate implementation).
Dev-only bootstrap for end-to-end testing before the admin UI exists: `scripts/dev-payment-setup.ts`.

### Android audit follow-up (offline)
An offline audit found and fixed: re-registration failing after revoke (installId binding), retry scheduling gaps,
over-eager credential pause on any 401, redirect handling, JS-vs-Java whitespace drift, regex validator gaps, refresh
failures downgrading acknowledged rows, batch result collisions, missing permission prompt, debug-panel guard, retention.
**Still open:** local DB is unencrypted; nothing Android-side has been compiled or run; ICU regex behaviour unverified.

## 10. Checkout, payment page & receipt (multi-provider)

- `startBkashPayment` (unchanged name, unchanged behavior/signature) still creates the Payment row and still
  snapshots `mfsProvider`/`receivingNumber` — this was already wired in phase 1.
- NEW `switchPaymentProvider(paymentId, provider)`: lets a student change MFS **before** they've sent anything
  (payment still `PENDING`). Re-snapshots the receiving number from `PaymentConfiguration`. Refuses once a TXID
  has been submitted, so a switch can never invalidate money already sent.
- `submitBkashTxid` needed NO changes: it already stores `transactionId`/`payerPhone` against whatever provider
  the order has and calls `matchStoredTransactionForPayment` — that was always provider-agnostic.
- `/payments/[paymentId]`: now shows a provider picker (only when more than one provider is configured),
  provider-specific instructions/app name/receiving number, and passes the provider name into `TxidForm`. The
  `AWAITING_VERIFICATION` state still shows nothing about risk/SMS-matching internals to the student — only
  "submitted, waiting for verification" — per the requirement not to expose internal security details.
- `/payments/[paymentId]/invoice`: the previously hardcoded "bKash" label now reads the order's actual provider.
  No second receipt/PDF system was created — this HTML/print invoice, already tied to the one `Payment` row, is
  the receipt. `formatMoney` already renders ৳ directly (no PDF font pipeline involved).

## 11. Admin UI

New pages, all `requireRole("ADMIN")`-gated like every other admin route:
- `/admin/payments/devices` — Android device list/register/rename/revoke (registration-code flow). Distinct from
  the legacy bKash-bridge token list, which stays on `/admin/settings/payments` unchanged.
- `/admin/payments/provider-rules` — publish new **immutable** rule versions (JSON), enable/disable a version.
  Never edits a past version. The UI repeats the "never guess sender IDs/wording" warning inline.
- `/admin/payments/suspicious` — review `SUSPICIOUS`/`UNVERIFIED` `PaymentTransaction` rows; REJECT (terminal) or
  ASSOCIATE with a still-open order (candidates come from the student's submitted TrxID, same "hint, not proof"
  rule the automatic matcher follows). ASSOCIATE never verifies/enrolls by itself — the existing "Verify" action
  on the payment is still the only thing that does.
- `/admin/settings/payments` gained an "SMS automatic verification" panel: the OFF/SHADOW/ENFORCE selector and a
  per-provider receiving-number editor, both calling the existing audited actions from `payment-device-actions.ts`.

## 12. Webhook / outbox delivery

`enqueueWebhook(paymentId, event, payload)` (`lib/payments/webhooks.ts`) writes to the existing `PaymentWebhook`
outbox (one row per `(paymentId, event, endpoint)`, so re-enqueuing is a no-op). Endpoints come from the
`PAYMENT_WEBHOOK_URLS` env var (comma-separated); unset = nothing is enqueued, documented as a no-op. Enqueue
calls were added at `payment.created` (checkout), `payment.completed` (after `markPaidAndEnroll`'s transaction
**commits** — never inside it), `payment.failed` (after rejection commits), `payment.expired` (in the existing
cron). `deliverDueWebhooks()` (`server/services/webhook-delivery.ts`) + `GET /api/cron/deliver-webhooks` (same
`CRON_SECRET` pattern as `expire-payments`) sign the body with `PAYMENT_WEBHOOK_SECRET` (HMAC-SHA256, optional —
delivery still happens unsigned if unset, just without the signature header) and retry with the same
exponential-backoff shape as the Android upload queue, up to 12 attempts. A receiver being down only delays its
own notifications; it cannot affect the payment, enrollment, or any other endpoint.

## 13. Honest final status of this pass

See the chat's final implementation report for the full breakdown. In short: TypeScript is written but only
partially type-checked (Prisma-dependent files couldn't be, no Prisma client generated in this environment);
Android changes are additional documentation only, no new/changed Kotlin in this pass; a full mobile-web audit
(phase 9 in the request) was **not** performed — only the new/changed payment and admin pages were written with
responsive classes matching the existing design system's conventions.
