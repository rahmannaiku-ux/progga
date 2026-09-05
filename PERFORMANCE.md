# Performance Notes

This file documents what's already been done for performance/SEO and what
to verify once the app is deployed somewhere Lighthouse can actually reach
it — a static analysis can't produce real Lighthouse scores, so treat the
checklist below as the verification pass to run post-deploy, not a
substitute for one.

## Already in place

- **Server Components by default** — nearly every page in this app is a
  server component (data fetched directly with Prisma, no client-side
  waterfall). `"use client"` is used only where interactivity requires it
  (forms with local state, the exam runner, upload buttons).
- **`next/image`** used for every avatar/thumbnail with real dimensions,
  with `remotePatterns` scoped to only the hosts actually used
  (Uploadthing, Clerk, YouTube thumbnails) in `next.config.mjs`.
- **Route-level code splitting** is automatic via the App Router — the
  mentor builder's client-heavy components never ship to a student's
  bundle and vice versa.
- **`loading.tsx` skeletons** on the catalog, course detail, and
  dashboard routes so navigation feels instant even while Prisma queries
  are in flight, instead of a blank screen.
- **`output: "standalone"`** in `next.config.mjs` for a minimal Docker
  image (only the files actually needed at runtime get copied in).
- **Security headers** (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, restrictive `Permissions-Policy`) applied globally.
- **SEO**: dynamic `sitemap.ts` (every published course + blog post),
  `robots.ts` disallowing authenticated app areas, per-page `metadata`
  exports on public pages, semantic heading structure throughout.
- **Rate limiting** (Phase 10) on write-heavy actions and all API routes,
  degrading gracefully to "off" if Upstash isn't configured rather than
  hard-failing local dev.

## Verify after deploying

- [ ] Run Lighthouse (Chrome DevTools or `npx lighthouse <url>`) against
      the deployed landing page, course catalog, and a course detail page.
      Target 90+ on Performance/Accessibility/Best Practices/SEO — the
      structure above should get you close, but real network conditions,
      your image CDN, and font loading strategy affect the actual number.
- [ ] Check Core Web Vitals in Vercel Analytics or Google Search Console
      once there's real traffic — synthetic Lighthouse runs and real-user
      field data can diverge.
- [ ] If LCP is dominated by the hero image/graphic on the landing page,
      confirm it isn't render-blocked by font loading — the
      `next/font/google` setup in `layout.tsx` should already self-host
      and avoid a FOUC, but verify in the Network tab.
- [ ] Bundle size: `next build` prints a route-by-route size table —
      re-check it after adding any new heavy client dependency
      (charting libraries, rich text editors, etc. in later work).
