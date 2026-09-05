import Link from "next/link";
import { Award, Download, Clock3, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { RetryCertificateButton } from "@/components/gamification/retry-certificate-button";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const TABS = [
  { key: "all", label: "All Certificates" },
  { key: "completed", label: "Completed" },
  { key: "in-progress", label: "In Progress" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function MedalsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  const tab: TabKey = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as TabKey) : "all";

  const [certificates, inProgress] = await Promise.all([
    db.certificate.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { course: { select: { title: true } } },
    }),
    db.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      include: { course: { select: { title: true, slug: true } } },
    }),
  ]);

  const showCompleted = tab === "all" || tab === "completed";
  const showInProgress = tab === "all" || tab === "in-progress";

  return (
    <StaggerContainer className="space-y-6">
      <StaggerItem className="flex items-center gap-2">
        <Award className="h-7 w-7 text-xp" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Certificates</h1>
          <p className="text-sm text-muted-foreground">
            Earned by completing a mission end to end.
          </p>
        </div>
      </StaggerItem>

      <StaggerItem className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/medals" : `/medals?tab=${t.key}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition-colors",
              tab === t.key
                ? "bg-xp text-xp-foreground shadow-card"
                : "bg-surface text-muted-foreground shadow-card hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </StaggerItem>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {showCompleted &&
            certificates.map((c) => (
              <StaggerItem
                key={c.id}
                className="comic-panel hover-glow-card relative overflow-hidden bg-surface p-5"
              >
                <Sparkles className="pointer-events-none absolute -right-1 -top-1 h-8 w-8 text-xp/40" />
                <div className="flex items-center gap-4">
                  <div className="sticker flex h-14 w-14 shrink-0 items-center justify-center bg-xp/15">
                    <Award className="h-7 w-7 text-xp" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-foreground">
                      {c.course.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.certificateNo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Earned {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(c.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  {c.status === "ISSUED" && c.pdfUrl ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={c.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="comic-btn flex w-fit items-center gap-1.5 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                      >
                        View Certificate
                      </a>
                      <a
                        href={c.pdfUrl}
                        download
                        className="comic-btn flex w-fit items-center gap-1.5 bg-xp px-4 py-2 text-xs font-bold text-xp-foreground"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  ) : c.status === "PENDING" ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" /> Generating...
                      </span>
                      <RetryCertificateButton certificateId={c.id} />
                    </div>
                  ) : (
                    <span className="sticker-badge bg-danger/10 px-3 py-1 text-xs font-bold text-danger">
                      Revoked
                    </span>
                  )}
                </div>
              </StaggerItem>
            ))}

          {showInProgress &&
            inProgress.map((e) => (
              <StaggerItem key={e.id} className="comic-panel bg-surface p-5 opacity-90">
                <div className="flex items-center gap-4">
                  <div className="sticker flex h-14 w-14 shrink-0 items-center justify-center bg-muted">
                    <Award className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-foreground">
                      {e.course.title}
                    </p>
                    <p className="mt-1 flex items-center gap-2">
                      <AnimatedProgressBar percent={e.progressPct} className="h-2" />
                      <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">
                        {Math.round(e.progressPct)}%
                      </span>
                    </p>
                  </div>
                  <Link href={`/courses/${e.course.slug}`} className="shrink-0 text-xs font-bold text-primary">
                    Continue
                  </Link>
                </div>
              </StaggerItem>
            ))}

          {showCompleted && certificates.length === 0 && showInProgress && inProgress.length === 0 && (
            <div className="comic-panel bg-surface p-10 text-center">
              <ProggyMascot state="thinking" className="mx-auto h-16 w-16" />
              <p className="mt-3 text-sm text-muted-foreground">
                No certificates yet — complete a mission to earn your first one.
              </p>
            </div>
          )}
        </div>

        <StaggerItem className="comic-panel-bold h-fit bg-primary p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 fill-xp text-xp" />
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-primary-foreground/70">
            Total Certificates
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold text-primary-foreground">
            {certificates.filter((c) => c.status === "ISSUED").length}
          </p>
          <p className="mt-1 text-xs text-primary-foreground/70">Earned</p>
        </StaggerItem>
      </div>
    </StaggerContainer>
  );
}
