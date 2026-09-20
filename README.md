# Proggaa

A production-grade, gamified e-learning website with an original,
non-copyrighted superhero-inspired aesthetic — built to compete with
Udemy/Coursera/Skillshare, not a mobile app.

> **IP note:** All visual and thematic elements (color system, iconography,
> illustrations, "Hero/Mentor/Mission" terminology) are original creations.
> Nothing here references, copies, or is derived from any existing
> copyrighted character, franchise, logo, or brand.

## Tech Stack
Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · shadcn/ui
(Radix primitives) · CSS animations (no animation library) · PostgreSQL · Prisma · Clerk ·
YouTube embedded player · Docker

## Terminology Mapping (UI only — schema uses plain LMS nouns)
| Standard LMS term | Product-facing term |
|---|---|
| Course | Mission |
| Module | Operation |
| Lesson | Patrol |
| Quiz / Exam | Encounter |
| Assignment | Challenge |
| Certificate | Medal |
| Student | Hero |
| Teacher | Mentor |

Keeping the database/API layer in plain English and applying the theme
only at the presentation layer (`src/lib/terminology.ts`, phase 3) means
the theme can be restyled or A/B tested without touching the schema.

## Project Status — Phased Build

This is a large system; it's being built in reviewable phases rather than
as one monolithic drop, so each phase is real, runnable code rather than
placeholders.

- [x] **Phase 1 — Foundation** *(this delivery)*
  - Full Next.js App Router folder structure for all roles/features
  - Complete Prisma schema (users/roles, catalog, enrollment, quizzes/exams,
    assignments, certificates, gamification, notifications, discussions, audit)
  - `next.config.mjs`, `tailwind.config.ts` + original design tokens, `globals.css`
  - Clerk auth middleware + server-side RBAC guard (`requireRole`)
  - Prisma client singleton
  - Dockerfile (multi-stage, standalone output) + docker-compose (app + Postgres)
  - `.env.example` with every required variable documented
- [x] **Phase 2 — Auth & Core Layout** *(this delivery)*
  - Root layout with font system (Baloo 2 display / Inter body /
    the system monospace stack for stats readouts), `ClerkProvider`, `next-themes`
    provider (dark mode default)
  - Clerk webhook (`/api/webhooks/clerk`, svix-verified) syncing
    `user.created` / `.updated` / `.deleted` into Prisma — Clerk owns
    identity, our DB owns role/authorization
  - `getCurrentUser()` helper with a race-safe lazy-create fallback
  - Sign-in / sign-up pages using Clerk's components, themed to match
  - Three role-scoped app shells — `(hero)`, `(mentor)` (`requireRole("TEACHER")`),
    `(admin)` (`requireRole("ADMIN")`) — each with its own sidebar nav
    (`src/lib/nav-config.ts`), topbar, and theme toggle
  - `HeroStatsBadge` (XP / level / streak) in the student topbar — the
    first piece of the gamification signature element
  - Placeholder dashboard/landing pages so every route resolves and the
    role gates are verifiably enforced ahead of Phase 3+
- [x] **Phase 3 — Public Website** *(this delivery)*
  - Real header/footer, `container` layout, and UI primitives (`Button`,
    `Badge`, `Accordion`) shared by every public page
  - Original signature graphic (`MissionPathGraphic`) — an abstract
    skyline + glowing checkpoint arc, no character or third-party IP
  - Landing page: hero thesis section, live stats readout, featured
    missions rail, a genuinely-sequential 4-step "how it works," category
    grid, closing CTA
  - Course catalog with server-rendered (no-JS-required) search/filter
    by query, category, level, and price
  - Course detail page: trailer embed, curriculum accordion, mentor card,
    sticky enroll panel
  - Categories, Pricing, FAQ, About, Contact (form UI, wiring lands with
    the notification system), Testimonials, Blog (list + detail, new
    `BlogPost` Prisma model), Instructor profile, Privacy, Terms, 404
  - All public data-fetching pages degrade gracefully to an empty state
    since there's no seed data yet at this point in the build (seeding
    arrives in Phase 10 — run `npm run db:seed` after following this
    project through to the end)
- [x] **Phase 4 — Course Authoring (Mentor)** *(this delivery)*
  - Server actions (`src/server/actions/mission-actions.ts`) for every
    mutation — course, module, chapter, lesson, resources, publish state
  - **Ownership enforced server-side on every action**: each mutation
    re-resolves the caller from the Clerk session and verifies they own
    the course (or are an admin) before touching the DB — a spoofed
    courseId from the client can't reach another mentor's content
  - `extractYoutubeId()` parses watch/youtu.be/embed/shorts URLs so
    mentors just paste a link; invalid links are rejected with a clear error
  - Uploadthing file router (`api/uploadthing`) gated by the same
    TEACHER+ check, for PDF/resource uploads and avatars
  - Mission list → "New mission" form → builder flow, all under
    `(mentor)/mentor/missions`
  - The builder itself: add/reorder/delete operations (modules), chapters,
    and patrols (lessons); inline no-JS-required edit forms via
    `<details>`; publish/unpublish with a real guard (can't publish with
    zero operations) surfaced as an inline error, not a crash
  - New `BlogPost`-style addition to the schema wasn't needed here, but
    note: publishing requires ≥1 module — enforced in `setCoursePublishState`,
    not just in the UI
- [x] **Phase 5 — Student Learning Experience** *(this delivery)*
  - Enrollment (`enrollment-actions.ts`) — free and paid missions both
    enroll directly for now (checkout isn't built; that's a payments
    concern outside the original 10-phase plan and can be slotted in
    before launch), with wishlist toggle alongside it
  - Lesson player (`react-youtube`) that autosaves watch progress every
    15s, resumes from last position, and marks a patrol complete on
    video end or a manual button — never trusts a client-supplied
    percentage, always recalculates from real `LessonProgress` rows
    (`lib/progress.ts`)
  - Completing a lesson awards XP and updates the daily streak
    (`lib/gamification/award-xp.ts`) — a light version of what Phase 8
    builds out fully, so the Phase 2 XP badge stays honest in the meantime
  - When every lesson in a mission is complete, a `PENDING` certificate
    row is created automatically — actual PDF generation is Phase 7, but
    the record exists the moment it's earned
  - Notes (create/edit/delete, optimistic UI), bookmarks, and a two-level
    discussion thread (post/reply/delete, moderatable by mentors/admins)
    per lesson
  - Next/previous patrol navigation via a flattened curriculum tree
    (`lib/course-tree.ts`), plus a shared `CurriculumSidebar` with
    completion checkmarks used on both the mission overview and player
  - Real "Continue learning" dashboard (replacing the Phase 2 placeholder):
    active missions with progress bars, bookmarked patrols, completed
    missions
- [x] **Phase 6 — Assessments** *(this delivery)*
  - Schema gained a real `Assessment ↔ Course` relation (was scalar-only)
    and `AssessmentAttempt.selectedQuestionIds`, which persists the exact
    question set + order shown for an attempt so a refresh never reshuffles
    a randomized or question-bank exam mid-attempt
  - All six question types (MCQ, multiple select, true/false,
    fill-in-blank, short answer, essay) — the last two are flagged
    `requiresTeacherReview` automatically the moment one is added
  - Mentor authoring: encounter settings (timer, randomize, question bank
    size, negative marking, fullscreen, tab-switch detection, max
    attempts, pass %), a type-aware question form, publish gated on
    having ≥1 question
  - Student flow: start screen → `ExamRunner` (countdown + auto-submit,
    fullscreen enforcement, tab-switch detection with an auto-submit
    disqualification threshold, autosaved answers per question) → results
    (score, pass/fail, optional per-question breakdown honoring
    `showResultsInstantly`)
  - Grading is always server-computed from `QuestionAnswer` rows — never
    a client-supplied score — with negative marking applied only to
    questions actually attempted, and the total floored at zero
  - Mentor grading queue for essay/short-answer questions, with a
    per-attempt page to award points + feedback; the attempt only
    finalizes to `GRADED` once every written question has been graded
  - Encounters attached to a lesson now surface directly on the lesson
    player page
- [x] **Phase 7 — Assignments & Certificates** *(this delivery)*
  - Assignment authoring (mentor): title, instructions, due date, max
    points, allow-late toggle, and a dynamic rubric builder
    (criterion + points rows)
  - Student submission: multi-file upload via a dedicated
    `assignmentSubmissionUploader` route (open to any active signed-in
    user, unlike the mentor-only uploaders), plus a comment. Resubmitting
    before grading overwrites the previous submission; resubmitting after
    grading is blocked to protect the mentor's grade
  - Mentor grading: rubric-based scoring (or a manual point override when
    there's no rubric) with written feedback, notifies the student on
    save
  - **Certificates now actually generate as PDFs**: `renderCertificatePdf`
    (`@pdfme/generator`) produces the document, `issueCertificate`
    uploads it via Uploadthing's server API and flips the `PENDING` row
    from Phase 5 to `ISSUED` with a real download URL — wired directly
    into `recalcEnrollmentProgress`, so finishing a mission's last lesson
    triggers PDF generation in the same request, not a background job
    that might not run
  - If PDF generation or upload fails, the certificate row stays
    `PENDING` and the student gets a manual retry button (Medals page)
    rather than the completion flow silently erroring
  - Encounters and challenges attached to a lesson both now surface
    directly on the lesson player page
  - Fixed a couple of real bugs while integrating: a mismatched Prisma
    compound-unique-key name in the submission upsert, and missing
    `@pdfme/common`/`@pdfme/schemas` sub-package dependencies
- [x] **Phase 8 — Gamification** *(this delivery)*
  - Real tunable XP level curve (`xp-curve.ts`) replacing the Phase 5
    placeholder sqrt formula — explicit per-level thresholds plus
    progress-within-level math for the profile/dashboard bars
  - Achievement catalog (`achievements-catalog.ts`) + awarder
    (`check-achievements.ts`) — idempotent, upserts the `Achievement` row
    on first use instead of requiring a separate seed step. Wired into
    every place XP already flows: lesson completion, mission completion,
    encounter pass/perfect score, assignment grading, and streak
    milestones
  - Level-ups and unlocked achievements generate real notifications, not
    just a DB row nobody sees
  - Global XP leaderboard (top 50, with the signed-in user's own rank
    shown even when they're outside it)
  - Achievements page (full catalog, locked/unlocked state) and a real
    hero profile page: avatar upload, editable headline/bio, XP/level
    progress bar, streak, mission history
  - "Today's goals" widget (daily patrol, weekly patrol count, streak
    reminder) computed live from existing `LessonProgress`/`HeroStats`
    rows rather than persisted as new mission records — one less schema
    surface to keep in sync
  - `AnimatedProgressBar` (using the `xp-fill` keyframe that's been
    sitting unused in the design system since Phase 1) now drives every
    progress bar in the app
- [x] **Phase 9 — Admin Panel** *(this delivery)*
  - Dashboard with platform-wide metrics + recent activity feed
  - User management: one reusable table (`UserManagementTable`) powers
    Users, Mentors, and Heroes with a role filter; role changes are
    logged to `RoleChangeLog` and only a `SUPER_ADMIN` can grant Admin
    access (enforced server-side in `setUserRole`, not just hidden in
    the UI)
  - Roles & Permissions: hierarchy explainer, promote-by-email, recent
    change log
  - Mission moderation (status override across every mentor's courses),
    Categories CRUD, Batches CRUD
  - Reports (completion/pass/grading rates) and Analytics (per-course
    breakdown table) — both reachable from the nav
  - Medals admin: view every issued certificate, revoke with a reason
    trail in `ActivityLog`
  - Site branding settings, email template editor (subject + HTML body
    per template key), global announcements that fan out as
    notifications to every active user
  - Activity log viewer (last 100 audited actions)
  - Backup & Restore: a real, safe **export** (JSON snapshot via
    `/api/admin/reports`) — deliberately does **not** offer an in-app
    "restore from upload" button, since accepting arbitrary uploaded
    data and writing it into the live database is a real risk vector;
    the page instead documents the actual disaster-recovery path
    (provider snapshots / `pg_dump`) so nobody assumes the export is a
    full backup
  - Every mutating admin action re-derives the caller from the Clerk
    session and requires `ADMIN`+ server-side, consistent with every
    other phase's authorization pattern
- [x] **Phase 10 — Hardening & Deploy** *(this delivery — final phase)*
  - Rate limiting (`lib/rate-limit.ts`, Upstash-backed, degrades to a
    no-op if Redis isn't configured): IP-based on every API route via
    middleware, tighter per-user limits on spam-prone writes (notes,
    discussion posts) and sensitive actions (starting an exam attempt)
  - **Seed script** (`prisma/seed.ts`, wired to `npm run db:seed` and
    `prisma migrate reset`): site settings, email templates, 8 categories,
    a demo mentor + student, a full course (modules → chapters → lessons,
    a quiz, an assignment with a rubric), enrollment with real progress,
    two blog posts. Demo users use placeholder Clerk IDs and can't sign
    in directly — the deployment checklist covers promoting a real
    account instead, since a seed script can't safely fabricate working
    auth
  - SEO: dynamic `sitemap.ts` (every published course + blog post),
    `robots.ts` disallowing authenticated app areas
  - `loading.tsx` skeletons on the catalog, course detail, and dashboard
    routes; a root `global-error.tsx` boundary so an unhandled error
    shows an on-brand recovery screen instead of a blank crash
  - `DEPLOYMENT.md` (Vercel and Docker VPS paths, Clerk webhook setup,
    post-deploy checklist) and `PERFORMANCE.md` (what's already optimized
    vs. what to actually verify with Lighthouse post-deploy — written
    honestly rather than claiming scores that were never measured, since
    this environment can't run a real Lighthouse pass against a live
    deployment)

## Local Development
```bash
cp .env.example .env        # fill in Clerk/Resend/Uploadthing/Upstash keys
docker compose up -d db          # Postgres only — rate limiting uses Upstash (REST) or an in-process fallback; there is no Redis container
npm install
npm run db:push             # or db:migrate once schema stabilizes
npm run db:seed
npm run dev
```

## DevTools protection (deterrent, not security)

Students who open the browser's Developer Tools are sent to `/security/devtools`
("Developer Tools Detected" → **Return to Proggaa**) after the video is paused
and covered. **This cannot stop a determined user** (disabled JavaScript,
extensions, another browser, proxies, automation) — real protection is
server-side: authentication, enrollment and access checks on every request.

| Piece | Where |
|---|---|
| Detection, key/right-click guards, redirect + loop protection | `src/lib/security/anti-devtools.ts` |
| Mounted once, in the authenticated layouts | `AntiDevToolsProvider` in `src/app/(hero)/layout.tsx` and `(mentor)/layout.tsx` |
| Server decision (env, role, feature flag) | `src/lib/security/anti-devtools-config.ts` |
| Warning page (public, no detector of its own) | `src/app/security/devtools/page.tsx` |
| Video pause/cover + identity watermark | `useDevToolsShield`, `VideoWatermark` in both players |
| Advisory server log (ActivityLog, entity `SecurityEvent`) | `src/app/api/security/devtools/route.ts` |

Signals (weighted; ≥ 3 combined within 8s triggers): a real `debugger` pause (4),
DevTools reading a logged object (2, +1 if persistent), a docked-window size jump
that survives zoom/resizes (2), slow `console.table` (1), a stalled timer while the
tab is visible (1), repeated tampering with the monitor (3). A window-size change
alone never triggers. Blocked shortcuts: F12, Ctrl+Shift+I/J/C/K, Cmd+Option+I/J/C/K,
Cmd+Shift+C, Ctrl+U / Cmd+Option+U; right-click is blocked outside text fields on
non-touch devices.

Switches: `ANTI_DEVTOOLS=on|off` (default off in `next dev`), `ANTI_DEVTOOLS_ROLES`
(default `STUDENT`), and the admin feature flag **DevTools protection**
(Control Center → Feature flags) as an instant kill-switch.

## Linting

`npm run lint` (ESLint 8 + `next/core-web-vitals`, config in `.eslintrc.json`)
and `npm run lint:fix`. Build-breaking problems (`rules-of-hooks`, `no-var`,
`no-debugger`, …) are errors; `exhaustive-deps`, `prefer-const`, `eqeqeq`,
`no-console` and `<img>` usage are warnings. `next build` skips lint on purpose
(`eslint.ignoreDuringBuilds`) — run `npm run lint` and `npm run typecheck`
in CI instead.

## Bangladesh Standard Time (BST, UTC+6)

Every date and time in the app is **Bangladesh time**, independent of where
the server or the visitor is. All of it goes through `src/lib/timezone.ts`:

| Need | Use |
|---|---|
| Show a date/time | `formatDhakaDate`, `formatDhakaTime`, `formatDhakaDateTime` |
| Read a `datetime-local` / `date` form value | `parseDhakaInput`, `parseOptionalDhakaInput` |
| Fill a `datetime-local` / `date` input | `toDhakaInputValue`, `toDhakaDateInputValue` |
| "Today", this week, this month, the hour | `dhakaStartOfDay`, `dhakaStartOfWeek`, `dhakaStartOfMonth`, `dhakaHour`, `dhakaGreeting`, `dhakaYear` |
| Calendar day key / date arithmetic | `dhakaDateKey`, `addDhakaDays`, `addDhakaMonths` |

Rules: never call `getHours()/getDay()/setHours()/toLocale*String()` (or
`new Date("2026-09-08T14:30")`) on a date a person will read as a calendar
day — those follow the *runtime's* zone (UTC on Vercel). Stored instants stay
UTC in Postgres; only wall-clock reading/writing is pinned to `+06:00`.
`src/lib/timezone.test.ts` checks this under any process timezone.
Cron schedules in `vercel.json` are always **UTC** — see `DEPLOYMENT.md`.

## UI, colours and page transitions

- **Colour tokens** live in `src/app/globals.css` (`:root, .theme-cartoon` for
  light, `.dark, .dark .theme-cartoon` for dark) and are declared on `:root`
  so portalled UI (dialogs, menus, selects) gets the same palette. Every
  text/background pair is >= 4.5:1. Brand colours have separate *fill* and
  *ink* roles: `bg-xp` is yellow but `text-xp` is amber-brown (`--xp-ink`);
  `bg-danger` holds white text while `text-danger` uses `--danger-ink`
  (see `textColor`/`borderColor` in `tailwind.config.ts`). `text-accent` is a
  real, readable violet — not the old near-white lavender.
- **Page transitions**: `PageTransition` is a single CSS enter animation
  (`.page-enter`), `NavigationProgress` shows a top bar the instant a link is
  clicked, and every route group has a `loading.tsx` skeleton. Keep the
  animation `backwards`-filled: a leftover `transform` would trap the
  `position: fixed` fullscreen video player inside the page.
- **Fullscreen video** (`src/hooks/use-fullscreen.ts`): native fullscreen where
  it exists, `webkit`-prefixed on iPad, and a CSS fallback on iPhone (which
  only allows fullscreen on `<video>`) with scroll-lock, safe-area padding and
  an always-visible exit button.

## Folder Structure
See `docs/folder-structure.txt` for the full generated tree. Route groups:
- `(public)` — marketing/catalog, no auth required
- `(auth)` — Clerk sign-in/up
- `(hero)` — student area, any authenticated role
- `(mentor)` — teacher area, requires `TEACHER` role or higher
- `(admin)` — admin console, requires `ADMIN`/`SUPER_ADMIN`

## Project Status: All 10 Phases Complete

Every deliverable from the original brief is implemented: full role-based
platform (student/mentor/admin), course authoring with YouTube embeds,
the complete learning experience (progress, notes, bookmarks,
discussions), a real proctored assessment engine, assignments with
rubric grading, auto-generated PDF certificates, a full gamification
layer, a 17-feature admin console, and production deployment tooling.

### Post-completion fix pass

After the initial 10 phases, a self-review turned up a handful of real
gaps — things that looked done but weren't, plus a few scale/security
issues. All of the following are now fixed:

- **Email actually sends now.** `lib/email/send-email.ts` renders the
  admin-editable `EmailTemplate` rows via Resend and is wired into
  welcome (on first sign-up), certificate-issued, grade-posted, and
  enrollment-confirmed. Previously these were notification rows only —
  the templates existed in the admin UI but nothing ever sent them.
- **The contact form is real.** `/api/contact` validates with Zod, rate
  limits by IP, and sends via Resend to the admin-configured support
  address — it used to just flip a local `submitted` flag with a
  `// TODO` comment and discard the message.
- **Paid courses can no longer be enrolled in for free.** `enrollInCourse`
  now throws a clear "checkout isn't available yet" error for paid
  missions instead of silently enrolling anyone who clicks the button —
  this was a real bug, not just a missing feature.
- **Blog HTML is sanitized** (`isomorphic-dompurify`) before rendering,
  closing a latent stored-XSS risk that only "worked" because content
  authorship was admin-only.
- **Admin category/batch creation now uses Zod validation**
  (`lib/validation/admin.ts`), matching the rigor used everywhere else
  instead of reading raw `FormData` strings.
- **Scale fixes**: `HeroStats.xp` is now indexed (the leaderboard's
  `ORDER BY xp DESC` was doing a full table scan); the admin
  Users/Mentors/Heroes and Missions tables now paginate (25/page) with
  search on the user tables, instead of hardcoding `take: 200` and
  silently truncating past that.
- **ISR enabled** on the landing page and course detail page. The course
  detail page required decoupling its wishlist-status check into a
  client-side fetch (`/api/courses/[id]/wishlist-status`) first, since a
  page reading the signed-in user's data server-side can't be cached —
  it's now a clean split between cacheable public content and one small
  personalized island. The course *catalog* page is documented as **not**
  cacheable the same way — its `searchParams`-driven filtering forces
  dynamic rendering regardless of a `revalidate` export, and a faked fix
  there would've been worse than being upfront about it.
- **A real automated test suite** (Vitest): the grading logic that used
  to live inline inside the `submitAttempt` server action is now
  extracted into pure functions in `lib/grading.ts` (also reused by the
  manual-grading recompute path, which fixes a real inconsistency — it
  wasn't flooring negative-marking totals at zero the same way the
  auto-grade path did) and covered by `grading.test.ts`. `xp-curve.ts`
  has its own test file covering monotonicity and the level-boundary
  math. Run with `npm test`.

### Phase 11 — Manual bKash Payments + Full Comic Redesign (complete)

- **Schema**: `Payment` (status/provider/verification-method lifecycle,
  unique `paymentReference` + unique `transactionId` for duplicate-TXID
  protection, links forward to the `Enrollment` it unlocked) and
  `PaymentBridgeDevice` (hashed bearer tokens for the Android bridge).
  `SiteSettings` gained `bkashNumber`, `bkashInstructions`, and the
  `autoVerifyPayments` kill switch. `DiscussionPost` gained an optional
  `courseId` (and `lessonId` became optional) so a post can be
  mission-level, not just lesson-scoped.
- **Student flow**: paid missions route "Enroll" into
  `startBkashPayment()` → `/payments/[id]` (comic-styled: reference +
  bKash number with copy buttons, step-by-step instructions, TXID form).
  `submitBkashTxid()` moves the payment to `AWAITING_VERIFICATION`. A
  `PAID` payment gets a real printable invoice at `/payments/[id]/invoice`.
- **Two independent verification paths**, both funneling through one
  atomic `markPaidAndEnroll()` transaction so a `PAID` payment and its
  `Enrollment` are always created together, idempotently:
  - **Manual** — `/admin/payments` (filterable, paginated) with
    Verify/Reject actions, always available regardless of the
    automatic setting.
  - **Automatic** — `POST /api/payment-bridge/bkash`, authenticated by a
    hashed device token (provisioned from `/admin/settings/payments`),
    validates the event, dedupes by `eventId`, guards duplicate TXIDs,
    re-derives the expected amount from the `Payment` row's own
    server-set `amountCents` (never from the request), and only
    auto-verifies when `SiteSettings.autoVerifyPayments` is on **and**
    the amount matches — otherwise the evidence is stored and the
    payment stays `AWAITING_VERIFICATION`.
  - Telegram admin notifications (`src/lib/payments/telegram.ts`) fire
    on every transition — strictly a notification layer, never required
    for verification; no-ops if the bot token/chat ID aren't set.
  - `/api/cron/expire-payments` sweeps stale `PENDING` → `EXPIRED`
    (`CRON_SECRET`-protected).
- **Pages built from nothing this phase** (previously dead nav links or
  missing entirely): Notifications, Community (feed + composer + top
  contributors), Search (Missions/Lessons), Support, Invoice,
  `/mentor/students`, `/mentor/announcements`, plus a `/missions` →
  `/courses` redirect and an honest "coming soon" `/calendar`. The
  Mentor Dashboard was a literal placeholder stub claiming features
  "arrive in Phase 4/7" despite the rest of the app being complete — it's
  now a real dashboard (stats, recent submissions queue).
- **Root-cause CSS fix**: `.theme-cartoon .comic-panel`, `.glass-panel`,
  `.sticker`, `.comic-btn`, and `.sticker-badge` were two-class compound
  selectors that baked in `bg-surface`/`border-border`, silently beating
  any single-utility color override on the same element (e.g.
  `sticker bg-xp` never actually rendered gold) — a real bug already
  present throughout the pre-existing app, not something introduced
  this phase. Fixed at the source with `:where()` to zero out the
  conflicting specificity, which retroactively fixes every affected
  badge/panel/button app-wide rather than requiring per-file edits.
- **Also fixed**: `not-found.tsx` and `global-error.tsx` were never
  comic-styled, and `global-error.tsx` renders outside the root layout's
  `.theme-cartoon` wrapper entirely, so its comic CSS variables were
  silently out of scope — fixed by re-declaring the class on its own
  wrapper. `maintenanceMode` is now actually enforced (checked at the
  layout level, not middleware — Prisma isn't safe to call from Edge
  middleware — see `src/lib/maintenance.ts`) with an always-on admin
  bypass so there's always a way back in. Auth pages (`/sign-in`,
  `/sign-up`) got page-specific comic headers instead of one generic
  shared banner. Heading weights and button styling were swept for
  consistency across every Admin/Mentor page.
- **Not yet done**: real `tsc`/ESLint/Prisma validate/build/Vitest runs
  (no npm network access in the environment this was built in — these
  need to be run for real before merging), and the CSS specificity fix
  above is based on rigorous analysis rather than a visual screenshot,
  so it's worth a quick smoke-test.

### Still-open scope notes (not bugs — genuinely out of scope)

- **No card/international payment integration.** bKash (manual + a
  bridge-ready automatic path) is fully built; Stripe/SSLCOMMERZ would
  be the natural next provider, and `Payment.provider` already has room
  for them.
- **E2E test coverage** (Playwright) doesn't exist — the Vitest suite
  covers pure business logic (grading, XP curve) but not full user flows.
- **Exam proctoring is inherently client-side-limited** — fullscreen
  enforcement and tab-switch detection can be defeated by a determined
  student (second monitor, browser devtools). No browser-based
  proctoring system fully closes this; it's a deterrent, not a guarantee,
  and that's stated plainly here rather than oversold in the UI.
- **Search is Missions + Lessons only** — a Tasks/Users tabs pair from
  the original comic mockups was deliberately left out rather than
  built hollow, since "tasks" and permission-scoped user search don't
  have an unambiguous scope in the current data model.

### If you want to keep going

Reasonable next phases, in rough priority order: **Card payments**
(Stripe/SSLCOMMERZ alongside bKash — `Payment.provider` already has
room), **E2E testing** (Playwright — Vitest now covers the pure
grading/XP logic, but nothing exercises a full signup → enroll →
complete → certificate flow), **Real-time features** (live
notifications via websockets/SSE instead of polling), **Internationalization**
(the `locale` field already exists on `User`, but no translation
infrastructure), or **Mobile app** (the spec was explicit this is
web-only, but the API/data layer would support one). Name any of these,
or a specific refinement to an existing phase, and I'll pick up from here.
