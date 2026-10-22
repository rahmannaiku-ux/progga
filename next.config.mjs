/** @type {import('next').NextConfig} */

// CSP built for the external services this app actually talks to from
// the browser: YouTube (lesson video embeds/thumbnails), UploadThing (file
// uploads + its CDN), Google Docs/Drive previews, and Google Fonts.
// `unsafe-inline` on style-src and a limited `unsafe-eval`/`unsafe-inline`
// on script-src are included because Next.js's App Router relies on inline
// scripts/styles that a strict nonce-based policy would break without
// deeper framework-level changes -- this is a pragmatic baseline that
// restricts *third-party* origins without breaking the app; it is not a
// guarantee against inline-script injection. Tighten further (nonces,
// stricter script-src) once each change can be tested against a running app.

// Stream Chat (Live Room, behind the `live_room` feature flag). Only added
// to the CSP when the public key is actually configured, so environments
// without Live Room enabled get no extra allowance. Exact origins per
// Stream's docs: REST at chat.stream-io-api.com, WebSocket at the same
// host under /connect. UNVERIFIED: whether Stream's edge/regional
// infrastructure routes some browsers to a different hostname -- confirm
// with Content-Security-Policy-Report-Only in a real browser before
// relying on this in production.
const streamConnectSrc = process.env.NEXT_PUBLIC_STREAM_API_KEY
  ? " https://chat.stream-io-api.com wss://chat.stream-io-api.com"
  : "";

const cspDirectives = [
  "default-src 'self'",
  // No eval in production (React's dev tools need it locally only), and YouTube's
  // player script over plain http only on the local http dev server.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval' http://www.youtube.com"} https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://utfs.io https://lh3.googleusercontent.com https://drive.google.com https://*.googleusercontent.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // blob: lets "Create reel" preview the chosen video before it uploads.
  "media-src 'self' blob: https://utfs.io",
  `connect-src 'self' https://uploadthing.com https://*.uploadthing.com https://utfs.io https://api.telegram.org ${streamConnectSrc}`.trim(),
  `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com https://docs.google.com https://drive.google.com`.trim(),
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Browsers ignore this over plain http (local dev); in production the site is https-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Pages opened from Proggaa (or that Proggaa opens) can't reach back into its window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.VERCEL ? undefined : "standalone", // standalone only for Docker builds, not Vercel
  // @pdfme/pdf-lib and @pdfme/common (both pulled in transitively by
  // @pdfme/generator, used for certificate PDF generation — see
  // src/lib/certificate/generate-certificate.ts) ship ESM-only builds.
  // @pdfme/generator's own CJS build does `require("@pdfme/pdf-lib")` /
  // `require("@pdfme/common")` internally, which neither Node's native
  // module loader nor webpack's default CJS bundling will do for a
  // pure-ESM target, so excluding them from bundling throws
  // ERR_REQUIRE_ESM at runtime. `transpilePackages` runs them through
  // Next's own compiler, which handles the ESM/CJS interop.
  transpilePackages: ["@pdfme/generator", "@pdfme/pdf-lib", "@pdfme/schemas", "@pdfme/common"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "utfs.io" }, // uploadthing CDN
      // Legacy: avatar URLs saved on accounts created before the custom
      // auth system (img.clerk.com, and Google's CDN for Google sign-ins).
      // Remove once no User.imageUrl points at these hosts.
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Student exam pages moved from /encounters to /exams.
  async redirects() {
    return [
      { source: "/encounters/:examId", destination: "/exams/:examId", permanent: false },
      // The testimonials page only held placeholder quotes, so it was removed.
      { source: "/testimonials", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // the admin portal and its sign-in step: never cached by a browser or proxy, never indexed
      ...["/admin/:path*", "/security/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
  // argon2 loads a prebuilt .node binary at runtime via node-gyp-build
  // (dynamic fs.readdirSync + require, not a static import), so
  // the bundler/tracer can't follow it. Two things are both
  // required to fix this on Vercel (confirmed via vercel/next.js
  // discussion #65978 — the external-packages flag alone was NOT
  // enough and still crashed in production):
  //   1. serverExternalPackages leaves `require("argon2")`
  //      un-bundled so it resolves against the real node_modules/argon2
  //      at runtime instead of a bundled chunk.
  //   2. outputFileTracingIncludes force-includes the prebuilds/
  //      directory in the deployed function, since @vercel/nft's
  //      static analysis can't discover files argon2 only reaches via
  //      a dynamic directory scan — without this the native binary
  //      itself never gets uploaded, even with (1) alone, and it still
  //      fails with "No native build was found for platform=linux
  //      ... abi=...".
  serverExternalPackages: ["argon2"],
  outputFileTracingIncludes: {
    // Certificate PDFs read these fonts and the logo from disk at runtime,
    // which tracing cannot see either.
    "/*": [
      "node_modules/argon2/prebuilds/**/*",
      "src/lib/certificate/fonts/*.ttf",
      "public/branding/proggaa-logo-512.png",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
