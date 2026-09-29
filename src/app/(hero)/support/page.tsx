import Link from "next/link";
import { Rocket, Wallet, Bug, LifeBuoy, Mail } from "lucide-react";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { getDestination } from "@/lib/config/destinations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BugReportForm } from "@/components/support/bug-report-form";
import { BUG_REPORT_STATUS_META } from "@/lib/bug-reports";
import { formatDhakaDate } from "@/lib/timezone";

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
    desc: "Something not working right? Report a bug.",
    icon: Bug,
    href: "#report-bug",
  },
];

export default async function SupportPage() {
  const user = await getCurrentUser();
  const [settings, docsDestination, myReports] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "singleton" } }),
    getDestination("documentation"),
    db.bugReport.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true, adminNote: true, createdAt: true },
    }),
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
          // (jump to the on-page bug report form) — never a broken link.
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

      <div id="report-bug" className="mt-6 scroll-mt-24">
        <BugReportForm />
      </div>

      {myReports.length > 0 && (
        <div id="my-reports" className="comic-panel mt-6 scroll-mt-24 bg-surface p-5">
          <h2 className="font-display text-base font-bold text-foreground">Your bug reports</h2>
          <ul className="mt-3 divide-y divide-border/40">
            {myReports.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-foreground">{r.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${BUG_REPORT_STATUS_META[r.status].className}`}
                  >
                    {BUG_REPORT_STATUS_META[r.status].label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Sent {formatDhakaDate(r.createdAt)}</p>
                {r.adminNote && (
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
                    <span className="font-bold">Support team: </span>
                    {r.adminNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
