# Deployment Guide

Two supported paths: **Vercel** (fastest, recommended for most teams) and
**Docker on a VPS** (full control, self-hosted Postgres).

---

## 1. Prerequisites (both paths)

- A [Supabase](https://supabase.com) project (Postgres 16). From the
  dashboard: Project Settings > Database > Connection string gives you
  both the pooled connection (Transaction pooler, port 6543 — for
  `DATABASE_URL`) and the unpooled one (port 5432 — for `DIRECT_URL`).
  Supabase's runtime connections go through its pgbouncer pooler, which
  doesn't support the prepared statements Prisma's schema commands
  issue, so both URLs are required (see `.env.example` for the exact
  format and a Free-tier IPv6 gotcha).
- A [Clerk](https://clerk.com) application (get publishable + secret keys,
  and configure a webhook — see step 3)
- An [Uploadthing](https://uploadthing.com) app (secret + app ID)
- A [Resend](https://resend.com) account for transactional email (optional
  at launch — the app runs without it, emails just won't send)
- Optional: [Upstash Redis](https://upstash.com) for rate limiting — the
  app degrades gracefully without it (rate limiting is simply disabled)

Copy `.env.example` to `.env` and fill in every value before your first
deploy. `DATABASE_URL`, `DIRECT_URL`, the two Clerk keys, and
`UPLOADTHING_SECRET` / `UPLOADTHING_APP_ID` are the only hard
requirements to boot the app.

---

## 2. Database migration

Run this once against your production database before the app's first
request (from your local machine, with `DATABASE_URL` and `DIRECT_URL`
pointed at prod):

```bash
npm install
npx prisma db push
npm run db:seed   # optional — populates categories, a demo course, blog posts
```

The repo ships no `prisma/migrations/` history — schema is managed via
`prisma db push`, not versioned migrations — so there's no `migrate
deploy` step. The one exception is `prisma/manual-migrations/`, which
holds a data-preserving change; **read
`prisma/manual-migrations/README.md` before running `db push` against
a database that already holds real data**, since `db push` can drop
data on destructive schema changes that a hand-written migration would
otherwise handle safely.

---

## 3. Clerk webhook

The app syncs user identity → `User` table via `/api/webhooks/clerk`. In
the Clerk dashboard:

1. Add an endpoint pointing at `https://<your-domain>/api/webhooks/clerk`
2. Subscribe to `user.created`, `user.updated`, `user.deleted`
3. Copy the signing secret into `CLERK_WEBHOOK_SECRET`

Without this, new sign-ups won't get a `User` row until they first hit a
protected page (the `getCurrentUser()` lazy-create fallback covers that
gap, but the webhook is the primary, reliable path).

---

## 4. Path A — Vercel

1. Push this repo to GitHub/GitLab/Bitbucket
2. Import the project in the Vercel dashboard
3. Add every variable from `.env` to the Vercel project's Environment
   Variables (Production + Preview)
4. Vercel auto-detects Next.js — no build command changes needed
   (`prisma generate` already runs via `postinstall`)
5. Deploy. First deploy will be slower due to `prisma generate`; subsequent
   ones are cached
6. Point your domain's DNS at Vercel, then update `NEXT_PUBLIC_APP_URL`
   and the Clerk webhook URL to match

**Cron jobs**: add a `vercel.json` with `crons` entries pointing at
`/api/cron/expire-payments` (expires stale pending bKash payments, run once
or twice a day) and `/api/cron/live-class-reminders` (notifies enrolled
students when a live class is starting within the next 20 minutes — run
every 5-10 minutes), and check `CRON_SECRET` in each route handler before
Vercel's scheduler is trusted to call it. Streak-risk notifications were
planned but have no route yet — add one under `src/app/api/cron/` and a
matching `crons` entry here if that gets built.

---

## 5. Path B — Docker on a VPS

1. Provision a VPS (2 vCPU / 4GB RAM is comfortable for moderate traffic)
   with Docker + Docker Compose installed
2. Clone the repo onto the server
3. Copy `.env.example` to `.env` and fill it in — for a fully self-hosted
   setup, point `DATABASE_URL` at the `db` service in `docker-compose.yml`
   (`postgresql://heroic:heroic@db:5432/heroic_lms`) and change the
   default Postgres password
4. Build and start:

```bash
docker compose up -d --build
docker compose exec app npx prisma db push
docker compose exec app npm run db:seed   # optional
```

5. Put a reverse proxy (Caddy, nginx, or Traefik) in front of the `app`
   container on port 3000, handling TLS termination. Caddy is the
   lowest-friction option — a two-line Caddyfile gets you automatic HTTPS:

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

6. For upgrades: `git pull && docker compose up -d --build`, then re-run
   `prisma db push` if the schema changed

**Backups**: see the in-app Backup & Restore page (Admin) for the
reasoning, but the short version — schedule `pg_dump` against your
Postgres container/volume to off-box storage. The in-app JSON export is
for reporting, not disaster recovery.

---

## 6. Post-deploy checklist

- [ ] Sign up with your real account, then promote yourself to `ADMIN` —
      run this once directly against the database (there's no bootstrap
      UI, deliberately, since granting admin from the app itself would be
      a privilege-escalation hole):
      ```sql
      UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = 'you@example.com';
      ```
- [ ] From Admin → Roles & Permissions, promote your mentor test account
- [ ] Verify the Clerk webhook fired (check Admin → Activity Logs after
      a fresh sign-up)
- [ ] Publish a test mission end-to-end: create → add a module/lesson →
      publish → enroll → complete → confirm a certificate PDF generates
- [ ] Run Lighthouse against the production URL and confirm no
      regressions vs. the numbers noted in `PERFORMANCE.md`
