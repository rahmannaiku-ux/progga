# Changelog

## 2026-10-20 - Reel posting switch
- New feature flag **Posting reels** (`reel_posting`, Admin -> Control Center -> Feature flags, on by default). Off hides
  every Create reel button and refuses new reel uploads and reel posts on the server (`startReelUpload`, `createPost`,
  `/api/reels/upload/*`). Watching, liking and commenting on existing reels is never affected.

## 2026-10-20 — Next.js 16
- **Upgraded Next.js 14.2.35 → 16.4.2 and React 18 → 19.2.** Next 14 is end-of-life with unpatched advisories.
  Builds now use Turbopack. Node 20.9+ is required.
- `params`, `searchParams`, `cookies()` and `headers()` are now awaited everywhere (the session cookie helpers and
  `getMissionsBase()` are async).
- Config: `serverExternalPackages` and `outputFileTracingIncludes` moved out of `experimental`; the `eslint` and
  `esmExternals` options are gone.
- ESLint 9 flat config (`eslint.config.mjs`). The new React Compiler lint rules are warnings.
- The lesson resource uploader uses `uploadthing/client` directly; `@uploadthing/react` (React 18 only) was removed.
  `next-themes` and the Radix packages were bumped for React 19.
- `src/middleware.ts` is now `src/proxy.ts`, Next 16's name for it. It runs on Node instead of Edge; its logic is
  unchanged and it still makes no database calls.

## 2026-10-19 — Apps, chats, groups, reels and more
Migrations (all additive): `20261019000000_community_comment_likes`, `20261019010000_community_reels`,
`20261019020000_birthday_sms`, `20261019030000_heartbeat`, `20261019040000_lesson_progress_duration`,
`20261019050000_community_usernames`, `20261019060000_group_chats`, `20261019070000_group_privacy`.

- **Apps for Windows and Android** (separate repo `rahmannaiku-ux/proggaa-apps`): the site in an app, with in-app
  updates from GitHub Releases and, on Android, phone notifications. Download page `/download` (header, footer and
  Settings link to it). The Android app reads new notifications from `GET /api/app/notifications`. Links and app
  detection: `src/lib/apps.ts`.
  Inside the apps, `/` goes to `/login` (or `/dashboard`) instead of the landing page, and paid missions show "Buy on
  prooggaa.com" (opens the browser) instead of checkout. Web push now works too: VAPID keys are set on Vercel.
- **Fixes from a screenshot pass of every page**: page-load (hydration) errors on Medals and on feeds with shared posts,
  names missing for students whose name was only in their profile (now copied to the account and kept in sync), and
  two pages that were wider than a phone screen.
- **Community, Facebook style**: create-post dialog, long-press reactions with a picker, inline comments with likes,
  "new posts" pill, lightbox, reactors list, Messenger-style chat.
- **Reels**: short vertical videos uploaded in chunks straight to Google Drive (`PROGGAA/reels`) and streamed back through
  `/api/files` with range requests. Full-screen player at `/community/reels`.
- **Usernames**: everyone has a unique @username (assigned from their name, changeable in Edit profile with
  availability checks and suggestions; once a week). Profiles open at `/community/u/<username>` too.
- **Group chats**: named chats of up to 50 people with admins, add/remove/leave, system lines, "seen by" faces and
  per-chat notifications. Chats is now a two-pane screen with search and All / Unread / Groups.
- **Groups**: public or private (members-only posts, join requests approved by admins or moderators), and roles owner /
  admin / moderator / member.
- **Progress bars** move while a lesson is watched, not only when it is finished.
- **Birthday SMS**: the birthday job now texts the student and is scheduled daily in `vercel.json` (needs `CRON_SECRET`).
- **Keep-alive**: `/api/keepalive` (daily Vercel cron and a GitHub Actions workflow) keeps the free Supabase project from
  pausing; Vercel Fluid compute is on.
- **Legal pages**: Terms, Privacy and Cookies rewritten for all of the above.

## 2026-10-13 — Proggaa Community
The old Community page (a list of course discussion posts) is now a student social network at `/community`.
Migration `20261013000000_proggaa_community` (additive only): 12 new tables, 5 enums, 5 `NotificationType` values and
`User.communityPrivate`. It is NOT applied by this change; it runs with the next `prisma migrate deploy`.

- **Feed** (`/community`): text / picture / question / poll posts, edit and delete your own, five reactions, comments
  with one level of replies, sharing with attribution, saved posts, cursor paging. Tabs: For you, Following, Trending,
  Questions.
- **Profiles** (`/community/u/[id]`): bio, headline, level, streak, badges, posts, follow / unfollow, followers and
  following, optional private profile. Never shows phone, email or grades.
- **Groups** (`/community/groups`): create, edit (owner), join / leave, group feed, topic filter, owner-appointed
  moderators who can remove posts and comments in their group.
- **Discover** (`/community/discover`): search posts, people and groups; suggestions and trending when not searching.
- **Messages** (`/community/messages`): one-to-one text chat, unread counts, polling every 8s while open. Students can
  message people who follow them, and any mentor or admin.
- **Notifications**: reactions, comments and replies, new followers, useful-answer marks and moderation decisions go
  through the existing bell and `/notifications`, never for your own actions, repeats folded within six hours.
- **Rewards**: only one thing earns XP, through the existing ledger: the asker of a question marking your answer as
  useful (15 XP, once per question, three a day). Three new badges. Posting, reacting and voting earn nothing.
- **Moderation**: report a post, comment or profile; admins decide at **Admin → Community Reports** (dismiss, hide,
  delete, or suspend the account through the existing suspension). Decisions go to the audit log. An admin cannot
  decide their own report or one about themselves.
- Rules live in `src/lib/community/rules.ts`, reads in `src/server/services/community.ts`, writes in
  `src/server/actions/community-actions.ts`, `message-actions.ts` and `community-moderation-actions.ts`.
- Tests: `src/lib/community/rules.test.ts` (always runs) and `src/server/actions/community.integration.test.ts`, which
  runs the real actions against Postgres and is skipped unless `COMMUNITY_TEST_DATABASE_URL` points at a local database.
- **Message notifications and pop-ups** (migration `20261013010000_community_message_notification`, one new
  `NotificationType`): a direct message notifies its recipient, one unread notification per chat, cleared when they
  open it. `NotificationWatcher` in the student layout checks every 25s while the tab is visible and pops up anything
  new (of any type), then refreshes the bell.
- The Patrol Q&A threads (`DiscussionPost`) are unchanged. The Community respects the existing `community` feature
  switch.

## 2026-10-12 — Mission intro video
- A mentor can paste a YouTube link as a mission's intro video (new mission form and Builder → details), saved in
  the existing `Course.trailerYoutubeId` column. No migration.
- Public mission page: the thumbnail gets a play button when there is an intro video and plays it in place (YouTube's
  player loads only when pressed); without a video the thumbnail is unchanged. The quick facts became stat tiles, and
  on phones the purchase panel (price, coupon, Enroll) floats at the bottom of the screen.

## 2026-10-12 — Exams: correct scores, no lost work, fairer rules, mentor tools
Migration `20261012000000_exam_fairness_and_extra_time` adds `Assessment.tabSwitchLimit` (default 3),
`shuffleOptions`, `revealAnswersAfterClose`, `AssessmentAttempt.extraTimeSeconds` and the `MENTOR_ACTION`
integrity event. All additive.

- **Scoring.** Grading moved to `server/services/attempt-grading.ts`, shared by submit, time-up, manual grading and
  regrade. Every question counts towards the maximum (a blank written answer no longer inflates the percentage), an
  attempt with nothing left to grade gets its result instead of waiting forever, coins are paid after manual grading
  too, and a disqualified attempt keeps its score but cannot pass or earn rewards.
- **Results don't change when a question is edited.** Each answer stores the question it was graded on
  (`lib/exam-attempt.ts`), and grading and the result page read that copy.
- **Starting an exam works in production.** `startAttempt`, `saveAnswer` and `submitAttempt` return their result
  instead of throwing, so the student sees the real message ("no attempts left", "not open yet").
- **Answers aren't lost.** The exam page shows saved / saving / not saved, retries a failed save, and lets a failed
  submit be retried. The countdown follows the server's clock.
- **Time-up is enforced by the server.** An attempt whose time ran out is closed when the student or mentor next
  opens it, and by `/api/cron/notification-reminders`.
- **Fairness.** Per-exam tab-switch limit (0 = record only; under two seconds away is ignored), optional per-student
  option shuffle, optional "hide correct answers until the exam closes", Bangla digits accepted in typed answers.
- **Mentor tools.** Edit a question, regrade an exam, add time to a running attempt, reopen a finished one, clear a
  disqualification, and download results as CSV (results page).

## 2026-10-12 — Cleanup
- Removed four files nothing imported (`enroll-button.tsx`, `daily-goals-widget.tsx`, `fade-in.tsx`, `lib/motion.ts`)
  and ten packages no file used (framer-motion, react-hook-form, @hookform/resolvers, date-fns and six Radix packages).
- The progress bars in the landing page previews were stuck empty: they waited for `FadeIn`, which the page stopped
  using. They now show their fill straight away.
- `sitemap.xml` is built per request, so a newly published mission or post appears without a redeploy.

## 2026-10-12 — Domain: prooggaa.com
- **https://prooggaa.com** is now the canonical production address, defined once in `src/lib/site-url.ts`. Page
  metadata, `sitemap.xml`, `robots.txt`, the purchase-SMS invoice link and certificate QR codes all read it from there,
  and a production build never emits a localhost or old-domain link even if `NEXT_PUBLIC_APP_URL` is wrong.
- Pages opened on the old `progga-zeta.vercel.app` address redirect (308) to the same path and query string on the
  new domain. `/api/*` is not redirected, so the Telegram bot, payment devices and cron callers keep working on the old
  address until they are repointed.
- Every page now has a canonical link and `og:url` for its own path. Vercel preview deployments block all crawlers.
- Students signed in on the old address sign in once more on the new one. See DEPLOYMENT.md → Domain for the
  dashboard settings that have to be changed by hand.

## 2026-10-01 — Batches removed
- Removed the Batches feature: **Admin → Batches** (`/admin/batches`), its actions and validation, and the `Batch` /
  `BatchMember` tables. Migration `20261001000000_remove_batches` drops both tables (any existing batch rows are lost).
  The HSC batch (graduation year) on student profiles is unrelated and unchanged.

## 2026-09-29 — Bug reports
- Students can report a bug from **Support** (`/support#report-bug`): title, description, where it happened, and up to 5
  screenshots (images ≤ 10 MB). Screenshots are stored in Google Drive under `PROGGAA/bug-reports` (new `BUG_REPORT`
  upload context, UploadThing fallback as usual). Students see their recent reports, the status, and the admin's reply.
- New **Admin → Bug Reports** (`/admin/bug-reports`): filter by status, view the reporter, browser, description and
  screenshots, and set the status (Open / In progress / Resolved / Closed) with a note. Admins are notified of new
  reports, and the reporter is notified when the status changes.
- Migration `20260929030000_bug_reports` (new `BugReport`, `BugReportImage`, `BugReportStatus`,
  `GoogleDriveConnection.bugReportsFolderId`).

## 2026-09-26 → 2026-09-29 — highlights (see `git log` for all)
- **Auth:** Clerk replaced by custom phone + SMS OTP + password (Argon2id), DB sessions, OTP-gated phone change;
  students stay signed in until a second device logs in.
- **Payments:** all prices in taka (৳); coupons fixed (taka amounts, Apply errors, stale unpaid orders); 100% coupons
  check out for free; purchase-success SMS with an invoice link; payments and invoices survive mission deletion.
- **Admin:** delete any mission (typed confirmation), coupon editor reachable from admin, student signup details,
  manual or scheduled (daily/weekly/monthly) leaderboard resets.
- **UX:** notification popover on the bell, Ctrl/Cmd+K command palette, phone-fitted lesson and live video players,
  animated Proggy mascot, mobile overflow and font fixes; Drive files cached in the student's browser.
- **Docs:** README rewritten as a working guide; DEPLOYMENT.md updated for migrations/crons/phone auth;
  old phase log moved to `docs/HISTORY.md`; new `CLAUDE.md`.


## Unreleased — bug-fix, Bangladesh time, contrast and navigation pass

### Bangladesh time (UTC+6)
- `src/lib/timezone.ts`: new `parseDhakaInput`, `toDhakaInputValue`, `dhakaStartOfDay/Week/Month`,
  `dhakaHour`, `dhakaGreeting`, `dhakaYear`, `addDhakaDays/Months` (+ unit tests, `timezone.test.ts`).
- **Fixed:** `datetime-local` / `date` values were parsed in the *server's* zone (UTC on Vercel), so a class
  scheduled for 7 PM was stored as 1 AM Dhaka. Fixed for live-class lessons, calendar events, exams
  (monitoring + access windows), assignments, course discounts and batches; edit forms now show Dhaka time.
- **Fixed:** "today" / "this week" / "this month" boundaries (dashboard, missions, daily goals, admin
  revenue-this-month — which also used the current time-of-day as the month start), the "streak logged
  today" check, the greeting hour, the footer year, and several date displays.
- Calendar component no longer mixes date-fns/browser-local math with Dhaka keys.
- Docker images set `TZ=Asia/Dhaka`; datetime inputs are labelled "Bangladesh time".

### Colours / CSS
- `text-accent` was ~1.1:1 (light) / 1.4:1 (dark) contrast, `text-xp` 1.7:1, `text-danger` 3.2:1, input borders
  1.4:1, placeholders ~2.5:1. All text pairs are now >= 4.5:1 (see README "UI, colours…").
- Theme tokens now also live on `:root`, so dialogs/menus/selects (portalled outside `.theme-cartoon`) match the app.
- `color-scheme` set for light/dark (native date pickers, scrollbars); focus outline visible on any background.
- Added the missing `h-4.5 / w-4.5 / h-13 / w-13` spacing values (those classes generated no CSS).
- Fixed `bg-accent text-primary` pairs (unreadable) and faint `/70` helper text.

### Navigation / performance
- Middleware: `/api/health`, `/api/cron/*`, `/api/contact`, `/api/uploadthing`, `/api/payment-bridge/*` no longer
  bounce to `/sign-in` (health check, crons, upload callback, payment bridge and the contact form were broken);
  unauthenticated API calls get JSON 401; CSP now allows Clerk's custom production domain.
- New `PageTransition` (CSS only), `NavigationProgress`, and `loading.tsx` skeletons per route group.
- Removed double navigation (`router.push` + `router.refresh()`), a redirect-only Server Action, most
  `prefetch={false}`, per-request `HeroStats` writes and duplicate `SiteSettings` queries; hero layout is parallel.
- Rate limiter no longer starts a module-scope `setInterval` (imported by Edge middleware).

### iPhone fullscreen video
- New `useFullscreen` hook (native, `webkit`-prefixed iPad, CSS fallback for iPhone with scroll-lock, safe-area
  padding, dedicated exit button; a rejected `requestFullscreen()` now falls back instead of throwing).
  First tap on hidden fullscreen controls no longer pauses/plays the video.

### Data integrity
- `awardXp` / `awardCoins`: ledger row and balance change now commit in one transaction (a crash in between used to
  lose the reward permanently because of the idempotency key).

### Lighter / calmer UI (second pass)
- **framer-motion is no longer used by any component.** Page transition, `Stagger*`, `FadeIn`, the three drawers/sheets,
  the nav "pills" and the purchase / lesson-complete pops are CSS (`globals.css`, `hooks/use-mount-transition.ts`).
  `Stagger*` are now server-renderable (no client JS). Presets in `lib/motion.ts` kept, without the library import.
- Removed backdrop-blur on mobile, dialog and exam overlays; header is solid on phones.
- Thinner outlines (`border-[3px]` -> `border-2`, 15 files), softer `comic-btn`/`comic-panel-bold`/speech-bubble shadows,
  gentler hover lift, lighter halftone pattern.
- Dropped the third font (JetBrains Mono) for the system monospace stack.
- Dashboard: removed the Community banners, the Achievements strip/card and the Daily Goals widget (and their
  queries) — still available on their own pages.
- One palette: deleted the dead legacy violet/cyan token block.
- `min-h-screen` -> `min-h-dvh` (iPhone toolbars), `viewport-fit=cover` + `theme-color`, touch targets >= 44px and 16px
  input text on touch screens.
- New `npm run check:contrast` (WCAG check of every text/background pair in both themes) and
  `node scripts/find-unused-deps.mjs` (unused packages + the `npm uninstall` line).
- Locale-safe numbers (`toLocaleString("en-US")`) to stop server/client hydration mismatches.

### DevTools protection (deterrent)
- New multi-signal detector (`lib/security/anti-devtools.ts`), mounted once per authenticated layout via
  `AntiDevToolsProvider`; blocks DevTools/view-source shortcuts and right-click (outside text fields, non-touch);
  on detection pauses + covers the video, then `location.replace("/security/devtools")`.
- New public page `/security/devtools` (observe-only status, always-enabled "Return to Proggaa" link, no auto-redirect back).
- Loop protection: per-tab singleton (Strict-Mode safe), cooldown + per-minute cap in `sessionStorage`, no detector on the warning page.
- Moving identity watermark over lesson and live-class video; advisory server log to `ActivityLog` (`SecurityEvent`).
- Kill-switches: `ANTI_DEVTOOLS`, `ANTI_DEVTOOLS_ROLES`, feature flag `devtools_protection`. Off in `next dev`.
- Player controls are now a clear overlay (soft fade, auto-hide while playing) instead of a solid bar; iframe pinned edge-to-edge,
  and `viewport-fit=cover` removed (it shifted the page/video sideways on iPhone landscape).
- Faster detection: 500 ms tick (was 1 s), `debugger` + console probes every tick (were every 5th / 2nd), an immediate probe on
  load / focus / tab-visible / resize, and a shorter window-gap streak. Persistent console signal ~6 s → ≤ ~1.5 s; first
  `debugger` probe 5 s → immediate. Debugger pause threshold 250 → 120 ms.
- Hardening: `debugger` probe gets a random `sourceURL` per call (defeats "never pause here"/ignore-list); the object probe now
  also uses `console.log` (Info level) since `console.debug` (Verbose) is hidden by DevTools' default filter; blocks Firefox
  Network (Ctrl/Cmd+Shift/Option+E) and responsive-design (…+M) shortcuts.
- Fix: the key guard no longer calls `stopPropagation()`, so the exam runner's own `document` keydown listener again logs
  DevTools shortcuts to the attempt's integrity record (they were being swallowed at the window capture phase).

### Automatic lesson completion
- Removed the "Mark as complete" button: students can no longer choose to complete a lesson.
- Completion is detected automatically and decided only on the server (`lib/lesson-progress.ts`, unit-tested): the player
  measures how much video was actually *played* (dragging the slider or skipping counts as nothing), the server adds it up
  (never accepting more than elapsed time x max speed since the last save) and completes the lesson once >= 85% was played
  AND the student reached >= 85% of the way through.
- **Fixed:** seeking to the end of a video used to trigger YouTube's "ended" event and complete the lesson. It no longer does.
- `updateLessonProgress` now takes the seconds played since the last save (its "mark complete" argument is ignored) and
  returns `{ completed }`.

### Lint
- Added `.eslintrc.json` (the `lint` script existed but there was no config, so `npm run lint` could not run), plus
  `npm run lint:fix`; `next build` does not lint (`eslint.ignoreDuringBuilds`). Replaced an
  `@typescript-eslint/no-var-requires` disable comment (that plugin isn't loaded by `next/core-web-vitals`).

### Repo hygiene
- Removed stray brace-named folders, duplicate `gitignore`, `tsconfig.tsbuildinfo`; removed the unused Redis
  service from `docker-compose.yml` (it required `REDIS_PASSWORD` for nothing); added OpenSSL to the Docker images.
- Stand-in Clerk `sign-in` / `sign-up` pages (originals were missing from the uploaded zip).
