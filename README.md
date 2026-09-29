# Proggaa

A gamified e-learning platform for Bangladeshi students, with a comic /
superhero-inspired look (all visuals and terminology are original, not
based on any existing franchise). It is a web app, not a mobile app.
Students ("Heroes") buy and take courses ("Missions"). Teachers
("Mentors") build and grade them. Admins run the platform.

- **Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind + Radix/shadcn-style UI ·
  PostgreSQL (Supabase) · Prisma 5 · Vitest · Docker / Vercel
- **Auth:** custom phone number + SMS OTP + password (Argon2id), DB-backed sessions. *(Clerk was removed, so ignore any Clerk references in older docs.)*
- **Money:** Bangladeshi taka only. Payments are made through bKash/MFS: students submit a transaction ID, which an admin verifies manually or which is matched automatically against SMS from an Android device.
- **Time:** everything shown to users is **Bangladesh time (UTC+6)**.

---

## Quick start (local)

Requirements: **Node ≥ 20**, a Postgres database (a Supabase project, or the `db` service in `docker-compose.yml`).

```bash
cp .env.example .env          # then fill in at least the "required" vars below
npm install                   # also runs `prisma generate`
npx prisma migrate deploy     # apply migrations to your DB
npm run db:seed               # optional: demo data (categories, a course, demo users)
npm run dev                   # http://localhost:3000
```

**Demo logins** (created by `db:seed`, dev only):

| Role | Phone | Password |
|---|---|---|
| Mentor | `+8801700000001` | `DemoMentor#2026` |
| Student | `+8801700000002` | `DemoStudent#2026` |

**Make yourself an admin:** register at `/register`, then run this once against the DB. There is no in-app bootstrap, on purpose:

```sql
UPDATE "User" SET role = 'SUPER_ADMIN' WHERE phone = '+8801XXXXXXXXX';
```

**Testing OTP locally without SMS:** set `OTP_DEV_LOG=1` (prints codes to the server console) and optionally `OTP_DEV_BYPASS_QUOTA=1`. Both are ignored when `NODE_ENV=production`.

### Environment variables

`.env.example` documents every variable in detail. At a glance:

| Needed for | Variables |
|---|---|
| **Required to boot** | `DATABASE_URL` (pooled, :6543), `DIRECT_URL` (direct, :5432), `NEXT_PUBLIC_APP_URL`, `OTP_HMAC_SECRET` |
| Sending OTP / purchase SMS | `ONECODESOFT_API_KEY`, `ONECODESOFT_SENDER_ID` |
| Crons (`/api/cron/*`) | `CRON_SECRET` (required in production; routes refuse to run without it) |
| Student uploads → Google Drive | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` |
| Mentor file uploads | `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` |
| Rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (falls back to in-memory if unset) |
| Question import / AI | `GOOGLE_DOCS_REDIRECT_URI`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Live Room chat | `NEXT_PUBLIC_STREAM_API_KEY`, `STREAM_API_KEY`, `STREAM_API_SECRET` (`LIVE_CHAT_PROVIDER=fake` for local dev) |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` (admin alerts), `PROGGAA_API_KEY`, `PROGGAA_BOT_WEBHOOK_URL`, `PROGGAA_BOT_WEBHOOK_SECRET` (bot integration) |
| Payment webhooks out | `PAYMENT_WEBHOOK_URLS`, `PAYMENT_WEBHOOK_SECRET` |
| DevTools deterrent | `ANTI_DEVTOOLS`, `ANTI_DEVTOOLS_ROLES` |

Every optional integration **degrades to a no-op** when its variables are unset. The app still runs, and only that feature is missing.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` → **`prisma migrate deploy`** → `next build` (so a deploy migrates the DB) |
| `npm test` / `npm run test:watch` | Vitest (`src/**/*.test.ts`, pure logic, no DB needed) |
| `npm run test:tz` | Re-runs the timezone tests under several process timezones |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint (`next build` does **not** lint, so run this yourself) |
| `npm run check:contrast` | WCAG contrast check of every colour pair in both themes |
| `npm run db:migrate` | Create + apply a new migration in dev (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | Apply pending migrations (prod/CI) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |

Before pushing, run: `npm run typecheck && npm run lint && npm test`.

One-off scripts in `scripts/` (run with `npx tsx scripts/<name>.ts`):

| Script | Purpose |
|---|---|
| `stream-setup-channel-type.ts` / `setup-stream.ts` | One-time setup of the Stream "liveclass" channel type |
| `stream-acceptance.ts` | Acceptance tests against a **test** Stream app before enabling `live_room` |
| `backfill-live-classes.ts` | Create `LiveClass` rows for old scheduled lessons (`--dry-run` supported) |
| `dev-payment-setup.ts` | **Dev DB only**: register a test payment device / synthetic SMS rules |
| `check-contrast.mjs`, `find-unused-deps.mjs`, `test-tz-matrix.mjs` | Tooling (see Commands) |

---

## Project map

```
prisma/
  schema.prisma          # ~68 models. DB uses plain LMS nouns (Course, Lesson, …)
  migrations/            # versioned migrations: the source of truth for the DB
  manual-migrations/     # historical hand-written SQL (see its README)
  seed.ts
src/
  middleware.ts          # Edge: public-route list, session-cookie presence check, per-IP API rate limit
  app/
    (public)/            # marketing site + course catalog, no login
    (proggaa-auth)/      # /login, /register, /forgot-password
    (auth)/              # legacy /sign-in, /sign-up → redirect to /login
    complete-profile/    # mandatory profile step after registration
    (hero)/              # student area (any signed-in user)
    (mentor)/            # teacher area (TEACHER+)
    (admin)/             # admin console (ADMIN+)
    api/                 # route handlers: cron, bot, payment device, files, live, uploads, …
  server/
    actions/             # Server Actions: ALL mutations go through here
    services/            # business logic shared by actions/routes (payments, auth, search, …)
    live/                # Live Room (Stream chat, access rules)
  lib/                   # pure helpers + integrations (auth, payments, sms, storage, timezone, …)
  components/            # UI, grouped by area (admin-dashboard, course, exam, live, ui, …)
  hooks/
docs/                    # deeper design docs + archived build history
```

### Where to find things

| Feature | Start here |
|---|---|
| Login / OTP / sessions / roles | `src/lib/auth/*` (`session.ts`, `otp.ts`, `require-auth.ts`, `require-role.ts`), `src/server/services/auth-service.ts`, `src/server/actions/auth-actions.ts` |
| Course authoring (builder) | `src/server/actions/mission-actions.ts`, `app/(mentor)/mentor/missions/[missionId]/builder` |
| Lesson player & auto-completion | `src/lib/lesson-progress.ts`, `src/lib/progress.ts`, `server/actions/learning-actions.ts` |
| Exams / grading | `src/lib/grading.ts`, `server/actions/attempt-actions.ts`, `assessment-actions.ts`, `server/services/question-bank.ts` |
| Question import (Docs/PDF/AI) | `src/lib/question-import/*`, `src/lib/ai/*`, `server/actions/question-import-actions.ts` |
| Checkout, coupons, discounts | `server/actions/payment-actions.ts`, `coupon-actions.ts`, `src/lib/payments/*` |
| Payment verification (manual + SMS) | `server/services/payment-verification.ts` (`markPaidAndEnroll`), `src/lib/payments/sms/*`. Full design: [docs/payment-automation.md](docs/payment-automation.md) |
| Certificates | `src/lib/certificate/*`, `server/actions/certificate-actions.ts` |
| XP, levels, coins, achievements, leaderboard | `src/lib/gamification/*`, `server/actions/leaderboard-actions.ts`, `store-actions.ts` |
| Live classes / Live Room | `src/lib/live-classes.ts`, `src/server/live/*`, `app/(hero)/live`, `app/(mentor)/live/manage` |
| File storage (Google Drive / Uploadthing) | `src/lib/storage/*`, `app/api/files/[uploadId]`, `app/api/uploadthing` |
| SMS (Onecodesoft) | `src/lib/sms/*` |
| Telegram bot API | `app/api/bot/*`, `app/api/telegram/*`, `src/lib/bot-api`, `src/lib/bot-webhook` |
| Feature flags & platform settings | `src/lib/config/*` (Admin → Control Center) |
| Sidebar navigation per role | `src/lib/nav-config.ts` |
| Emails | `src/lib/email/*` (templates are editable in Admin → Settings) |
| Bug reports | Student form on `/support` (`components/support/bug-report-form.tsx`), admin triage at `/admin/bug-reports`, `server/actions/bug-report-actions.ts`. Screenshots go to the Drive folder `PROGGAA/bug-reports` |

---

## Conventions (read before changing code)

- **Terminology is UI-only.** The database and code use plain LMS nouns, and only the UI uses the themed names:

  | Code / DB | UI |
  |---|---|
  | Course | Mission |
  | Module | Operation |
  | Chapter / LessonGroup | Chapter / Group |
  | Lesson | Patrol |
  | Assessment (quiz/exam) | Encounter |
  | Assignment | Challenge |
  | Certificate | Medal |
  | Student / Teacher | Hero / Mentor |

- **Authorization is server-side.** Middleware only checks that a session cookie *exists* (Edge can't reach Prisma). Real checks happen in layouts, route handlers and every Server Action: `requireRole(...)`, `requireActiveUser()`, `requireMentorUser()`, `requireAdminUser()`, plus course-ownership checks. Never trust IDs, prices or scores from the client.
- **Role order:** `STUDENT < TEACHER < ADMIN < SUPER_ADMIN`. Only a `SUPER_ADMIN` can grant admin.
- **Money** is stored as integers in poisha (`*Cents` columns = 1/100 taka). Display with `formatMoney()` from `src/lib/payments/format.ts`. Prices are always recomputed on the server.
- **Dates:** use only the helpers in `src/lib/timezone.ts` (see below). Never use `getHours()` / `toLocaleString()` on a date a person will read.
- **Schema changes:** edit `prisma/schema.prisma`, then run `npm run db:migrate -- --name <what_changed>` and commit the generated folder under `prisma/migrations/`. Don't use `db push` against a shared or production DB. When existing rows need data moved, hand-edit the generated SQL (use `--create-only` first).
- **New public route?** Add it to `PUBLIC_ROUTE_PATTERNS` in `src/middleware.ts`, or signed-out visitors get redirected to `/login`.
- **New feature switch?** Add it to `src/lib/config/feature-flag-definitions.ts` and check it with `isFeatureEnabled(key)`. Current flags: `registration`, `course_purchases`, `exams`, `devtools_protection`, `community`, `live_room` (default off), `ai_question_generator` (default off).
- **Tests** sit next to the code as `*.test.ts` and cover pure logic only. Put business rules in a pure function in `lib/` so they can be tested.

### Bangladesh Standard Time (BST, UTC+6)

Every date and time in the app is **Bangladesh time**, wherever the server or the visitor is. All of it goes through `src/lib/timezone.ts`:

| Need | Use |
|---|---|
| Show a date/time | `formatDhakaDate`, `formatDhakaTime`, `formatDhakaDateTime` |
| Read a `datetime-local` / `date` form value | `parseDhakaInput`, `parseOptionalDhakaInput` |
| Fill a `datetime-local` / `date` input | `toDhakaInputValue`, `toDhakaDateInputValue` |
| "Today", this week, this month, the hour | `dhakaStartOfDay`, `dhakaStartOfWeek`, `dhakaStartOfMonth`, `dhakaHour`, `dhakaGreeting`, `dhakaYear` |
| Calendar day key / date arithmetic | `dhakaDateKey`, `addDhakaDays`, `addDhakaMonths` |

Stored instants stay UTC in Postgres; only reading and writing wall-clock times is pinned to `+06:00`. Cron schedules are always **UTC** (see `DEPLOYMENT.md`).

### UI, colours and page transitions

- **Colour tokens** live in `src/app/globals.css` (`:root, .theme-cartoon` for light, `.dark, .dark .theme-cartoon` for dark), so portalled UI (dialogs, menus) gets the same palette. Every text/background pair is ≥ 4.5:1 (`npm run check:contrast`). Brand colours have separate *fill* and *ink* roles: `bg-xp` is yellow but `text-xp` is amber-brown. `bg-danger` holds white text while `text-danger` uses `--danger-ink` (see `tailwind.config.ts`).
- **No animation library.** Transitions are CSS (`PageTransition`, `.page-enter`, `hooks/use-mount-transition.ts`). Keep page animations `backwards`-filled, because a leftover `transform` traps the `position: fixed` fullscreen video player.
- **Fullscreen video** (`src/hooks/use-fullscreen.ts`): native fullscreen, the `webkit`-prefixed API on iPad, and a CSS fallback on iPhone.
- Every route group has a `loading.tsx` skeleton. Mobile first: touch targets ≥ 44px, inputs ≥ 16px text.

### DevTools protection (deterrent, not security)

Students who open browser DevTools get redirected to `/security/devtools` after the video pauses. **This cannot stop a determined user.** Real protection is the server-side auth, enrollment and access checks.

| Piece | Where |
|---|---|
| Detection, key/right-click guards, redirect + loop protection | `src/lib/security/anti-devtools.ts` |
| Mounted once in authenticated layouts | `AntiDevToolsProvider` in `(hero)/layout.tsx`, `(mentor)/layout.tsx` |
| Server decision (env, role, flag) | `src/lib/security/anti-devtools-config.ts` |
| Warning page | `src/app/security/devtools/page.tsx` |
| Advisory server log | `src/app/api/security/devtools/route.ts` (ActivityLog, entity `SecurityEvent`) |

Switches: `ANTI_DEVTOOLS=on|off` (off by default in `next dev`), `ANTI_DEVTOOLS_ROLES` (default `STUDENT`), and the feature flag **DevTools protection** as an instant kill switch.

### Linting

ESLint 8 + `next/core-web-vitals` (`.eslintrc.json`). Build-breaking problems (`rules-of-hooks`, `no-var`, `no-debugger`) are errors. `exhaustive-deps`, `prefer-const`, `eqeqeq`, `no-console` and `<img>` are warnings. `next build` skips lint on purpose, so run it in CI.

---

## More docs

| Doc | For |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploying (Vercel / Docker), crons, post-deploy checklist |
| [docs/payment-automation.md](docs/payment-automation.md) | SMS-based payment verification design, device protocol, rollout modes |
| [PERFORMANCE.md](PERFORMANCE.md) | What's optimized and what to verify after deploying |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes |
| [CLAUDE.md](CLAUDE.md) | Short working guide for AI coding assistants |
| [docs/HISTORY.md](docs/HISTORY.md) | Archived phase-by-phase build log (partly outdated) |

## Known limits

- Payments are bKash/MFS only (no card gateway). `Payment.provider` has room for one.
- No end-to-end (Playwright) tests. Vitest covers only pure logic.
- Exam proctoring and DevTools detection run in the browser, so they deter cheating but can't guarantee it.
- The Android SMS-bridge app referenced in `docs/payment-automation.md` is **not in this repo**.
