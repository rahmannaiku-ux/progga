import Link from "next/link";
import { Rocket, Wallet, Bug, LifeBuoy, Mail } from "lucide-react";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { getDestination } from "@/lib/config/destinations";

const TOPICS = [
  {
    label: "Getting Started",
    desc: "New to Proggaa? Start here.",
    icon: Rocket,
    href: "/courses",
  },
  {
    label: "Payments",
    desc: "bKash payments, refunds & invoices",
    icon: Wallet,
    href: "/payments",
  },
  {
    label: "Missions",
    desc: "How missions and progress work",
    icon: Rocket,
    href: "/courses",
  },
  {
    label: "Technical Issues",
    desc: "Something not working right?",
    icon: Bug,
    href: "#contact",
  },
];

export default async function SupportPage() {
  const [settings, docsDestination] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "singleton" } }),
    getDestination("documentation"),
  ]);
  const supportEmail = settings?.supportEmail ?? "support@proggaa.com";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="comic-panel halftone-dots relative overflow-hidden bg-surface p-8 text-center">
        <ProggyMascot state="welcoming" className="mx-auto h-24 w-24" groundShadow />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">How can we help?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse a topic below, or reach out directly.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOPICS.map((t) => {
          const cardContent = (
            <>
              <span className="sticker flex h-9 w-9 items-center justify-center bg-accent/15 text-accent">
                <t.icon className="h-4 w-4" />
              </span>
              <p className="mt-2 font-display text-sm font-bold text-foreground">{t.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
            </>
          );

          // "Technical Issues" links out to the admin-configured
          // documentation/help-center destination when one is set and
          // active; otherwise it falls back to its original behavior
          // (jump to the on-page contact section) — never a broken link.
          if (t.label === "Technical Issues" && docsDestination) {
            return (
              <a
                key={t.label}
                href={docsDestination.url}
                target={docsDestination.openInNewTab ? "_blank" : undefined}
                rel={docsDestination.openInNewTab ? "noopener noreferrer" : undefined}
                className="hover-glow-card comic-panel bg-surface p-5"
              >
                {cardContent}
              </a>
            );
          }

          return (
            <Link key={t.label} href={t.href} className="hover-glow-card comic-panel bg-surface p-5">
              {cardContent}
            </Link>
          );
        })}
      </div>

      <div id="contact" className="comic-panel mt-6 bg-surface p-6 text-center">
        <LifeBuoy className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-2 font-display text-base font-bold text-foreground">Still need help?</p>
        <p className="mt-1 text-sm text-muted-foreground">Our support team is ready to help.</p>
        <a
          href={`mailto:${supportEmail}`}
          className="comic-btn mt-4 inline-flex items-center gap-1.5 bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
        >
          <Mail className="h-4 w-4" /> Contact support
        </a>
      </div>
    </div>
  );
}
