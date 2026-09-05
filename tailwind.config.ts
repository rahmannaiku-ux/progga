import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        // Bouncy heading face used only on the cartoon-themed landing page.
        cartoon: ["var(--font-display)", "sans-serif"],
      },
      colors: {
        // Original palette: deep void + circuit-violet + signal-cyan.
        // Evokes a masked hero swinging through a neon skyline without
        // referencing any existing character, studio, or brand.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          glass: "hsl(var(--surface-glass) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))", // circuit-violet
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))", // signal-cyan
          foreground: "hsl(var(--accent-foreground))",
        },
        xp: {
          DEFAULT: "hsl(var(--xp))", // golden yellow
          foreground: "hsl(var(--xp-foreground))",
        },
        danger: "hsl(var(--danger))",
        border: "hsl(var(--border))",
        ink: "hsl(var(--border))", // semantic alias — comic outlines / mascot linework
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // Sidebar is a fixed deep-purple "game HUD" regardless of the
        // light/dark toggle applied to the rest of the app — reference
        // design always shows a dark purple rail, so it gets its own
        // token set rather than reusing --surface/--foreground.
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          foreground: "hsl(var(--sidebar-fg))",
          muted: "hsl(var(--sidebar-fg) / 0.65)",
          active: "hsl(var(--sidebar-active))",
          "active-foreground": "hsl(var(--sidebar-active-fg))",
          border: "hsl(var(--sidebar-border))",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(circle at 50% 0%, hsl(var(--primary) / 0.16), transparent 60%)",
        "sidebar-texture":
          "radial-gradient(hsl(0 0% 100% / 0.05) 1.5px, transparent 1.5px)",
      },
      backgroundSize: {
        "sidebar-texture-size": "22px 22px",
      },
      boxShadow: {
        glass: "0 8px 32px 0 hsl(var(--background) / 0.37)",
        glow: "0 0 24px hsl(var(--accent) / 0.35)",
        card: "0 2px 10px hsl(var(--border) / 0.08), 0 1px 2px hsl(var(--border) / 0.06)",
        "card-hover": "0 10px 24px hsl(var(--border) / 0.14), 0 2px 6px hsl(var(--border) / 0.08)",
        pop: "0 6px 0 hsl(var(--border) / 0.9)",
      },
      keyframes: {
        "streak-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "xp-fill": {
          from: { width: "0%" },
          to: { width: "var(--xp-target, 100%)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "streak-pulse": "streak-pulse 2s ease-in-out infinite",
        "xp-fill": "xp-fill 1.2s ease-out forwards",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;
