/** @type {import('next').NextConfig} */

// CSP built for the external services this app actually talks to from
// the browser: Clerk (auth widgets + its own asset/API domains),
// YouTube (lesson video embeds/thumbnails), UploadThing (file uploads
// + its CDN), and Google Fonts if used by the design system. `unsafe-inline`
// on style-src and a limited `unsafe-eval`/`unsafe-inline` on script-src
// are included because Next.js's App Router and Clerk's prebuilt
// components rely on inline scripts/styles that a strict nonce-based
// policy would break without deeper framework-level changes — this is a
// pragmatic baseline that meaningfully restricts *third-party* origins
// (the main XSS/exfiltration/clickjacking vectors) without breaking the
// app; it is not a guarantee against inline-script injection. Tighten
// further (nonces, stricter script-src) as a follow-up once there's a
// way to actually test each change against a running app.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://www.youtube.com http://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://utfs.io https://img.clerk.com https://*.clerk.com https://lh3.googleusercontent.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' https://utfs.io",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://uploadthing.com https://*.uploadthing.com https://utfs.io https://api.telegram.org",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.clerk.accounts.dev https://challenges.cloudflare.com https://docs.google.com https://drive.google.com",
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
  },
};

export default nextConfig;
