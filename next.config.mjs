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
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.youtube.com http://www.youtube.com https://s.ytimg.com`.trim(),
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://utfs.io https://lh3.googleusercontent.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' https://utfs.io",
  `connect-src 'self' https://uploadthing.com https://*.uploadthing.com https://utfs.io https://api.telegram.org ${streamConnectSrc}`.trim(),
  `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com https://docs.google.com https://drive.google.com`.trim(),
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lint runs as its own step (`npm run lint`, e.g. in CI) — not inside
  // `next build`, so a style warning/error can never block a deploy.
  eslint: { ignoreDuringBuilds: true },
  output: process.env.VERCEL ? undefined : "standalone", // standalone only for Docker builds, not Vercel
  // @pdfme/pdf-lib and @pdfme/common (both pulled in transitively by
  // @pdfme/generator, used for certificate PDF generation — see
  // src/lib/certificate/generate-certificate.ts) ship ESM-only builds.
  // @pdfme/generator's own CJS build does `require("@pdfme/pdf-lib")` /
  // `require("@pdfme/common")` internally, which neither Node's native
  // module loader nor webpack's default CJS bundling will do for a
  // pure-ESM target:
  //   - Excluding these from bundling (experimental.serverComponentsExternalPackages,
  //     the old config here) leaves Node's native require() to load the
  //     raw file at runtime, which throws ERR_REQUIRE_ESM.
  //   - Bundling them normally (no external-packages config at all)
  //     makes webpack itself refuse with "Module not found: ESM
  //     packages (...) need to be imported. Use 'import' to reference
  //     the package instead."
  // `transpilePackages` + `esmExternals: 'loose'` is the combination
  // Next.js documents for exactly this "an ESM-only npm package needs
  // to work through a CJS require() somewhere in the chain" situation:
  // it runs these packages through Next's own compiler (which handles
  // the ESM/CJS interop) instead of handing them to webpack raw.
  transpilePackages: ["@pdfme/generator", "@pdfme/pdf-lib", "@pdfme/schemas", "@pdfme/common"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "utfs.io" }, // uploadthing CDN
      { protocol: "https", hostname: "img.clerk.com" },
      // Clerk sometimes returns the original OAuth provider's avatar URL
      // (not always re-hosted at img.clerk.com) — Google's is the one
      // we've seen show up unproxied for Google-sign-in students.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Student exam pages moved from /encounters to /exams.
  async redirects() {
    return [{ source: "/encounters/:examId", destination: "/exams/:examId", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // See the transpilePackages comment above — 'loose' mode lets
    // webpack auto-correct remaining ESM/CJS interop edges for the
    // same @pdfme packages that Next docs recommend it for.
    esmExternals: "loose",
    // argon2 loads a prebuilt .node binary at runtime via node-gyp-build
    // (dynamic fs.readdirSync + require, not a static import), so
    // webpack's bundler/tracer can't follow it. Two things are both
    // required to fix this on Vercel (confirmed via vercel/next.js
    // discussion #65978 — the external-packages flag alone was NOT
    // enough and still crashed in production):
    //   1. serverComponentsExternalPackages leaves `require("argon2")`
    //      un-bundled so it resolves against the real node_modules/argon2
    //      at runtime instead of a webpack chunk.
    //   2. outputFileTracingIncludes force-includes the prebuilds/
    //      directory in the deployed function, since @vercel/nft's
    //      static analysis can't discover files argon2 only reaches via
    //      a dynamic directory scan — without this the native binary
    //      itself never gets uploaded, even with (1) alone, and it still
    //      fails with "No native build was found for platform=linux
    //      ... abi=...".
    serverComponentsExternalPackages: ["argon2"],
    outputFileTracingIncludes: {
      // Certificate PDFs read these fonts and the logo from disk at runtime,
      // which tracing cannot see either.
      "/*": [
        "node_modules/argon2/prebuilds/**/*",
        "src/lib/certificate/fonts/*.ttf",
        "public/branding/proggaa-logo-512.png",
      ],
    },
  },
};

export default nextConfig;
