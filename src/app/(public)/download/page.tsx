import Link from "next/link";
import { headers } from "next/headers";
import { Bell, Download, Monitor, RefreshCw, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDhakaDate } from "@/lib/timezone";
import {
  ANDROID_DOWNLOAD_URL,
  APPS_RELEASES_URL,
  APPS_REPO,
  APP_CHECK_UPDATE_URL,
  WINDOWS_DOWNLOAD_URL,
  detectApp,
  guessPlatform,
  parseLatestRelease,
  type LatestRelease,
} from "@/lib/apps";

export const metadata = {
  title: "Download the app",
  description: "Proggaa for Android and Windows: notifications, one-tap opening and automatic updates.",
};

/** The newest release from GitHub, cached for a few minutes; null if GitHub can't be reached. */
async function latestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${APPS_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    return res.ok ? parseLatestRelease(await res.json()) : null;
  } catch {
    return null;
  }
}

const mb = (bytes: number | null) => (bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : null);

export default async function DownloadPage() {
  const ua = (await headers()).get("user-agent");
  const inApp = detectApp(ua);
  const platform = guessPlatform(ua);
  const release = await latestRelease();
  const androidFirst = platform !== "windows";

  const cards = [
    {
      key: "android",
      icon: Smartphone,
      title: "Android",
      href: ANDROID_DOWNLOAD_URL,
      button: "Download for Android",
      size: mb(release?.androidBytes ?? null),
      note: "Android 7 or newer",
      steps: [
        "Tap Download, then open the file (Proggaa.apk).",
        "If your phone asks, allow your browser to install apps, then tap Install.",
        "Open Proggaa and sign in. Allow notifications so you hear about replies and classes.",
      ],
    },
    {
      key: "windows",
      icon: Monitor,
      title: "Windows",
      href: WINDOWS_DOWNLOAD_URL,
      button: "Download for Windows",
      size: mb(release?.windowsBytes ?? null),
      note: "Windows 10 or 11, 64-bit",
      steps: [
        "Click Download and open Proggaa-Setup.exe.",
        'If Windows shows "Windows protected your PC", click More info, then Run anyway.',
        "Proggaa installs in a few seconds and opens. Find it later in the Start menu.",
      ],
    },
  ] as const;
  const ordered = androidFirst ? cards : [cards[1], cards[0]];

  return (
    <div className="halftone-dots container py-14">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local image */}
          <img src="/branding/proggaa-logo-512.png" alt="" width={112} height={112} className="h-28 w-28" />
          <h1 className="mt-2 font-display text-3xl font-bold text-foreground sm:text-4xl">Get the Proggaa app</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Everything on prooggaa.com, in an app: open it with one tap, get notifications on your phone, and it keeps
            itself up to date.
          </p>
          {release && (
            <p className="mt-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground">
              Latest version {release.version} · {formatDhakaDate(release.publishedAt, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {inApp && (
          <div className="comic-panel mx-auto mt-8 flex max-w-xl flex-col items-center gap-3 bg-surface p-5 text-center sm:flex-row sm:text-left">
            <ShieldCheck className="h-8 w-8 shrink-0 text-accent" aria-hidden="true" />
            <div className="flex-1 text-sm">
              <p className="font-bold text-foreground">
                You&apos;re using Proggaa for {inApp.kind === "android" ? "Android" : "Windows"} {inApp.version}.
              </p>
              <p className="text-muted-foreground">It checks for updates by itself. You can also check now.</p>
            </div>
            <a href={APP_CHECK_UPDATE_URL} className="comic-btn inline-flex h-11 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check for updates
            </a>
          </div>
        )}

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {ordered.map((c) => (
            <section key={c.key} className="comic-panel flex flex-col bg-surface p-6" aria-labelledby={`dl-${c.key}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <c.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 id={`dl-${c.key}`} className="font-display text-xl font-bold text-foreground">
                    {c.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {c.note}
                    {c.size ? ` · ${c.size}` : ""}
                  </p>
                </div>
              </div>
              <a
                href={c.href}
                className={cn(
                  "comic-btn mt-5 inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-bold",
                  (c.key === "android") === androidFirst ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                )}
              >
                <Download className="h-4 w-4" aria-hidden="true" /> {c.button}
              </a>
              <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                {c.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Bell, title: "Notifications", body: "Replies, messages, class reminders and results on your phone, even when the app is closed." },
            { icon: RefreshCw, title: "Updates itself", body: "When a new version is out, the app offers it and installs it for you. No need to download again." },
            { icon: Zap, title: "One tap away", body: "Its own icon, stays signed in, and opens straight to your dashboard." },
          ].map((f) => (
            <li key={f.title} className="comic-panel bg-surface p-4">
              <f.icon className="h-5 w-5 text-accent" aria-hidden="true" />
              <p className="mt-2 font-bold text-foreground">{f.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 space-y-2 text-center text-xs text-muted-foreground">
          <p>
            On an iPhone or iPad? Open prooggaa.com in Safari, tap Share, then <strong>Add to Home Screen</strong>.
          </p>
          <p>
            The apps are free and are published on{" "}
            <a href={APPS_RELEASES_URL} className="font-semibold text-accent underline" rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
            , where every version is listed. By installing, you agree to our{" "}
            <Link href="/terms" className="font-semibold text-accent underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold text-accent underline">
              Privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
