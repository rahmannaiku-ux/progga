# Admin and super admin

Two staff roles run the platform. A **super admin** owns the system; an **admin** does the daily work.

## What only a super admin can do

Pages (`requireSuperAdmin()` in `src/lib/auth/require-role.ts`, hidden from an admin's menu by `superAdminOnly` in
`src/lib/nav-config.ts`) and their server actions (`requireSuperAdminUser()` in `src/server/actions/require-user.ts`):

- Roles & Permissions: admin roles, and resetting another admin's two-step sign-in
- Payment Settings (bKash number, auto-verify), Payment Devices, Provider Rules
- Branding (including maintenance mode), Email Templates
- Control Center: runtime settings, feature switches, site links (destinations)
- Backup & Restore and the JSON data export (`/api/admin/reports`)
- Storage (Google Drive connect/disconnect, deleting uploads) and Apps (releases, oldest version allowed)
- Activity Logs (an admin sees only their own recent actions on the dashboard)
- Deleting a mission, a category or a store item

Who may change whom (`src/lib/auth/admin-hierarchy.ts`): only a super admin grants admin access, or changes or
suspends any admin. Nobody changes their own role. The last active super admin can't be demoted or suspended.

## Two people for the riskiest changes

Admin → **Requests** (`/admin/requests`): an admin asks for a new payment receiving number or for admin access for
someone, with a reason. A super admin other than the asker approves (the change is applied then, through the same
code a super admin uses directly) or rejects it. Table `SensitiveChangeRequest`; service
`src/server/services/sensitive-requests.ts`. An admin can still make someone a mentor directly there.

## Alerts

Every active super admin gets an in-app notification (`src/server/services/super-admin-alerts.ts`) when: a payment
receiving number, payment setting, SMS rule or payment device changes; an admin role changes or an admin is
suspended/restored; a feature switch or site link changes; a request waits or is decided; an admin turns on
two-step, uses a recovery code, has two-step reset, or keeps entering wrong codes.

## Two-step sign-in (all admins and super admins)

`src/lib/auth/admin-mfa.ts`, `src/lib/auth/totp.ts`, `src/server/services/two-step.ts`, page `/security/two-step`.

- An admin account opens nothing (no admin page, no mentor or student page, no server action, no `/api` route)
  until its session passes a code from an authenticator app (Google Authenticator, Microsoft Authenticator...).
  The first visit sets it up and shows ten one-time recovery codes.
- The code is asked again after 12 hours, after 2 hours without use, and on every new sign-in.
- A code works once (`mfaLastUsedStep`); wrong codes are rate limited (`otpVerify`) and reported to super admins.
- The secret is encrypted with `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` (`src/lib/storage/token-crypto.ts`): rotating
  that key makes every admin set up two-step again.
- Admin sessions are always read fresh from the database (no 30-second cache), so a revoked admin session stops at
  once. Admin pages are sent with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

### If the only super admin loses the phone AND the recovery codes

Nobody can reset it from the app (a super admin can't reset their own). Reset it in the database (Supabase SQL
editor), then sign in again and set up a new authenticator:

```sql
UPDATE "User" SET "mfaSecretEncrypted" = NULL, "mfaEnabledAt" = NULL, "mfaLastUsedStep" = NULL,
       "mfaRecoveryCodeHashes" = '{}' WHERE phone = '<the super admin''s phone, e.g. 017XXXXXXXX>';
UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = (SELECT id FROM "User" WHERE phone = '<same>');
```

Better: keep a second super admin, so one can reset the other from Roles & Permissions.

## Not covered

The Telegram bot's admin commands (`/api/bot/admin/*`, `/api/bot/payments/*`) authenticate with the bot's API key
and the linked Telegram account, not with two-step sign-in. The hierarchy rules (`setUserRoleCore`,
`setUserSuspendedCore`) still apply there.
