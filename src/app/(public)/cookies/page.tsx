import Link from "next/link";
import { CookieSettingsLink } from "@/components/shared/cookie-settings-link";

export const metadata = { title: "Cookie Policy" };

const UPDATED = "19 October 2026";

const ESSENTIAL = [
  {
    name: "proggaa_session",
    purpose: "Keeps you signed in. Contains a random token that is checked against our database.",
    duration: "30 days, renewed while you use the site",
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
    name: "gdrive_oauth_state, gdocs_oauth_csrf",
    purpose:
      "Temporary security cookies used only while an admin or mentor connects Google Drive or Google Docs.",
    duration: "10 minutes",
  },
  {
    name: "gdocs_access_token",
    purpose: "Lets a mentor who connected Google Docs pick a document to attach. Mentors only.",
    duration: "Until Google's sign-in expires (about an hour)",
  },
];

// Not cookies: small settings kept in your own browser (localStorage / sessionStorage).
// They are never sent to us and you can clear them in your browser at any time.
const BROWSER_STORAGE = [
  { name: "theme", purpose: "Remembers light or dark mode." },
  { name: "proggaa-player-skin", purpose: "Remembers the look you picked for the lesson video player." },
  { name: "proggaa:recent-searches", purpose: "Your recent searches, so you can repeat them quickly." },
  { name: "proggaa:dob-reminder-snoozed-until", purpose: "Hides the \"add your birthday\" reminder for a while after you dismiss it." },
  { name: "proggaa:devtools:redirect", purpose: "A security setting for the current tab only; cleared when the tab closes." },
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
          <h2 className="font-display text-lg font-semibold text-foreground">Settings stored in your browser</h2>
          <p className="mt-2">
            These are not cookies and are never sent to us. They only remember your preferences on this
            device.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
            <ul className="divide-y divide-border/40">
              {BROWSER_STORAGE.map((c) => (
                <li key={c.name} className="space-y-1 p-3">
                  <p className="font-mono text-xs font-semibold text-foreground">{c.name}</p>
                  <p>{c.purpose}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3">
            If you turn on phone notifications, your browser also keeps a notification subscription for
            Proggaa. You can turn it off in Settings or in your browser.
          </p>
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
            may store data needed to run the chat. Community photos and reels are played from
            Proggaa&apos;s own address, so watching them sets no Google cookies.
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
