# Deployment Guide

Two supported paths: **Vercel** (what production uses today) and **Docker on a VPS** (full control, self-hosted Postgres).

---

## 1. Prerequisites (both paths)

- **Postgres 16.** Usually a [Supabase](https://supabase.com) project. From Project Settings → Database → Connection string you need both:
  - `DATABASE_URL`: the **Transaction pooler** (port 6543, `?pgbouncer=true`), used at runtime.
  - `DIRECT_URL`: the **Session pooler / direct** connection (port 5432), used by Prisma for migrations (pgbouncer can't run them).
  - On the Supabase Free plan the plain `db.<ref>.supabase.co` host is IPv6-only. If you get `P1001`, use the IPv4 `aws-0-<region>.pooler.supabase.com:5432` host for `DIRECT_URL`.
- **Onecodesoft SMS** account with an API key **and a registered Sender ID**. Registration and password reset send OTPs by SMS, so production can't sign anyone up without it.
- `OTP_HMAC_SECRET` and `CRON_SECRET`: generate each with `openssl rand -hex 32`.
- **Optional integrations.** Each one is a no-op when unset:
  - Google OAuth client: Drive storage for student uploads, Docs question import
  - Uploadthing: mentor resources
  - Resend: email
  - Upstash Redis: shared rate limiting. Without it the limiter is in-memory, per instance.
  - Stream: Live Room chat
  - Gemini: AI question generation
  - Telegram: admin alerts and the bot integration

Every variable is documented in `.env.example`. The README has a summary table.

---

## 2. Database migrations

The schema is managed with **versioned Prisma migrations** in `prisma/migrations/`.

- **Vercel:** `npm run build` runs `prisma migrate deploy` before `next build`, so every deploy applies pending migrations automatically, using `DIRECT_URL`.
- **Docker:** `docker-entrypoint.sh` runs `prisma migrate deploy` at container start.
- **By hand:** `npm run db:migrate:deploy` with `DATABASE_URL`/`DIRECT_URL` pointed at the target DB.

Optional demo data: `npm run db:seed`. It creates demo mentor and student accounts with known passwords, so **don't seed production** unless you delete or re-password those accounts afterwards.

Don't run `prisma db push` against production: it keeps no history and can drop data. `prisma/manual-migrations/` holds older hand-written SQL from before the migration history existed. It's for reference only and already reflected in the schema.

**Adding a migration:** change `schema.prisma`, run `npm run db:migrate -- --name short_description` locally, and commit the new folder. If existing rows need data moved, generate with `--create-only`, hand-edit the SQL, then apply.

---

## 3. Path A — Vercel

1. Import the repo in Vercel (framework is auto-detected).
2. Add every variable from `.env` under Project → Settings → Environment Variables (Production and Preview). Set `NEXT_PUBLIC_APP_URL` to the real domain.
3. Deploy. The build migrates the DB (see §2).
4. **Google OAuth:** add `https://<domain>/api/admin/storage/google/callback` and `https://<domain>/api/mentor/google-docs/callback` as redirect URIs, and set `GOOGLE_REDIRECT_URI` / `GOOGLE_DOCS_REDIRECT_URI` to match. Then connect the Drive account from Admin → Storage.
5. **argon2** is a native module. `next.config.mjs` already force-includes its prebuilt binaries in the Vercel trace, so don't remove that block.

### Cron jobs

There is **no `vercel.json` in the repo**, so schedule these in Vercel (add a `vercel.json`) or with any external scheduler. Each is a `GET` that must send `Authorization: Bearer $CRON_SECRET`. In production they refuse to run if `CRON_SECRET` is unset. **Schedules are UTC** (BST = UTC+6, so `0 20 * * *` = 02:00 Dhaka).

| Route | Does | Suggested schedule |
|---|---|---|
| `/api/cron/expire-payments` | `PENDING` payments past expiry → `EXPIRED` | daily/hourly, e.g. `0 20 * * *` |
| `/api/cron/live-class-reminders` | Notify enrolled students ~20 min before a live class | every 5 min |
| `/api/cron/live-class-sweep` | Sync `LiveClass` states with their schedule (start/end stragglers) | every 15–30 min |
| `/api/cron/deliver-webhooks` | Deliver the outgoing payment-webhook outbox (only if `PAYMENT_WEBHOOK_URLS` is set) | every few minutes |
| `/api/cron/prune-device-nonces` | Delete old payment-device replay-ledger rows | daily |

Example `vercel.json`. The Hobby plan allows only daily crons, so the 5-minute jobs need Pro or an external pinger such as cron-job.org:

```json
{
  "crons": [
    { "path": "/api/cron/expire-payments", "schedule": "0 20 * * *" },
    { "path": "/api/cron/live-class-reminders", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/live-class-sweep", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/deliver-webhooks", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/prune-device-nonces", "schedule": "30 20 * * *" }
  ]
}
```

Leaderboard resets (daily/weekly/monthly) are computed when the board is read, so they need no cron.

---

## 4. Path B — Docker on a VPS

1. A VPS with Docker + Docker Compose (2 vCPU / 4 GB RAM is comfortable).
2. Clone the repo. Copy `.env.example` to `.env` and fill it in, adding `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Compose builds `DATABASE_URL` for the `db` service from these and refuses to start without them. Postgres is not exposed to the host, and there is no Redis container.
3. Build and start. Migrations run automatically on container start:

   ```bash
   docker compose up -d --build
   docker compose exec app npm run db:seed   # optional, see §2
   ```

4. Put a TLS reverse proxy in front of port 3000. For example, a Caddyfile:

   ```
   yourdomain.com {
       reverse_proxy localhost:3000
   }
   ```

5. Upgrades: `git pull && docker compose up -d --build`.
6. Crons: call the routes in §3 from the host's crontab with `curl -H "Authorization: Bearer $CRON_SECRET"`.

**Backups:** schedule `pg_dump` to off-box storage. The in-app Admin → Backup export is for reporting, not disaster recovery.

---

## 5. Post-deploy checklist

- [ ] `GET /api/health` returns 200.
- [ ] Register your own account at `/register` (tests the SMS OTP end to end).
- [ ] Promote yourself once, directly in the DB. There's no in-app bootstrap, on purpose:
      ```sql
      UPDATE "User" SET role = 'SUPER_ADMIN' WHERE phone = '+8801XXXXXXXXX';
      ```
- [ ] Admin → Roles & Permissions: promote a mentor test account.
- [ ] Admin → Settings → Payments: set the bKash number / receiving numbers.
- [ ] Admin → Storage: connect the Google Drive account (if using Drive).
- [ ] Admin → Control Center → Feature flags: confirm what should be on (`live_room` and `ai_question_generator` default **off**).
- [ ] End to end: create a mission, add a lesson, publish, buy it as a student (or use a 100% coupon), verify the payment, complete the mission, and confirm a certificate is issued.
- [ ] Hit each cron route once with the bearer token and check for a 200.
- [ ] Run Lighthouse against production (see `PERFORMANCE.md`).
