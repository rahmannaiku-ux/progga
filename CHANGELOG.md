# Changelog

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
