/**
 * Required for Next.js to run globals.css's `@tailwind base/components/
 * utilities` directives through the Tailwind + Autoprefixer PostCSS
 * plugins at build time. Both packages were already listed in
 * package.json devDependencies (tailwindcss, autoprefixer) — this file
 * was the missing piece actually wiring them into the build. Without
 * it, Next.js has no PostCSS pipeline configured at all, so none of
 * the app's Tailwind utility classes would be generated.
 *
 * Plain CommonJS (module.exports), matching Next.js's own default
 * template — package.json has no "type": "module", so this parses as
 * CommonJS by default, same as tailwind.config.ts's require() calls.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
