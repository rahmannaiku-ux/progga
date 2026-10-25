"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { APP_THEME_SINCE, APP_THEME_URL, compareVersions, detectApp } from "@/lib/apps";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid a hydration mismatch: we don't know the persisted theme on the
  // server, so render nothing meaningful until mounted on the client.
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" aria-hidden />;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
        // In the Android app, the status, navigation and tab bars recolour to match.
        const app = detectApp(navigator.userAgent);
        if (app?.kind === "android" && compareVersions(app.version, APP_THEME_SINCE) >= 0) {
          setTimeout(() => window.location.assign(APP_THEME_URL), 50);
        }
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-surface text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
