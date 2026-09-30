import Link from "next/link";
import { CookieSettingsLink } from "@/components/shared/cookie-settings-link";

export const metadata = { title: "Cookie Policy" };

const UPDATED = "30 September 2026";

const ESSENTIAL = [
  {
    name: "proggaa_session",
    purpose: "Keeps you signed in. Contains a random token that is checked against our database.",
    duration: "Up to 30 days",
  },
  {
    name: "proggaa_device",
    purpose: "A random device identifier used to protect your account and spot suspicious sign-ins.",
    duration: "2 years",
  },
  {
    name: "proggaa_cookie_consent",
    purpose: "Remembers the cookie choice you made on this site.",
    duration: "1 year",
  },
  {
    name: "Theme setting (browser storage)",
    purpose: "Remembers light or dark mode.",
    duration: "Until cleared",
  },
  {
    name: "Short-lived sign-in state cookies",
    purpose:
      "Temporary cookies used only while an admin or mentor connects Google Drive or Google Docs.",
    duration: "Minutes",
  },
];

export default function CookiesPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">Cookie Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          Cookies are small files a website stores in your browser. Proggaa uses only a few, and we do
          not use advertising or cross-site tracking cookies. More about how we handle your data is in
          our{" "}
          <Link href="/privacy" className="font-semibold text-accent underline">
            Privacy policy
          </Link>
          .
        </p>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Essential cookies (always on)
          </h2>
          <p className="mt-2">
            The site cannot work without these, so they are not affected by your choice.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
            <ul className="divide-y divide-border/40">
              {ESSENTIAL.map((c) => (
                <li key={c.name} className="space-y-1 p-3">
                  <p className="font-mono text-xs font-semibold text-foreground">{c.name}</p>
                  <p>{c.purpose}</p>
                  <p className="text-xs">Lasts: {c.duration}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Third-party embeds (your choice)
          </h2>
          <p className="mt-2">
            Lesson videos are played from YouTube, and some resources are previewed from Google Docs or
            Drive. When you choose <strong className="text-foreground">Essential only</strong>, videos
            load through YouTube&apos;s privacy-enhanced mode, which avoids setting YouTube cookies
            until you play a video. When you choose{" "}
            <strong className="text-foreground">Accept all</strong>, YouTube and Google may use their
            normal cookies as described in their own policies. Live room chat is provided by Stream and
            may store data needed to run the chat.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Change your choice</h2>
          <p className="mt-2">
            You can change your choice at any time:{" "}
            <CookieSettingsLink className="font-semibold text-accent underline" />. You can also block
            or delete cookies in your browser settings, but you will not be able to sign in without the
            essential ones.
          </p>
        </section>
      </div>
    </div>
  );
}
