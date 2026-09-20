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

### Lint
- Added `.eslintrc.json` (the `lint` script existed but there was no config, so `npm run lint` could not run), plus
  `npm run lint:fix`; `next build` does not lint (`eslint.ignoreDuringBuilds`). Replaced an
  `@typescript-eslint/no-var-requires` disable comment (that plugin isn't loaded by `next/core-web-vitals`).

### Repo hygiene
- Removed stray brace-named folders, duplicate `gitignore`, `tsconfig.tsbuildinfo`; removed the unused Redis
  service from `docker-compose.yml` (it required `REDIS_PASSWORD` for nothing); added OpenSSL to the Docker images.
- Stand-in Clerk `sign-in` / `sign-up` pages (originals were missing from the uploaded zip).
