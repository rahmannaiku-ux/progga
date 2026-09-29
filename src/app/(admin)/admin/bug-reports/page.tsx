import Link from "next/link";
import { Bug } from "lucide-react";
import type { BugReportStatus, Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { BUG_REPORT_STATUSES, BUG_REPORT_STATUS_META } from "@/lib/bug-reports";
import { Pagination } from "@/components/admin-dashboard/pagination";
import { BugReportControls } from "@/components/admin-dashboard/bug-report-controls";

const PAGE_SIZE = 20;

export default async function AdminBugReportsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string; open?: string };
}) {
  await requireRole("ADMIN");

  const status = BUG_REPORT_STATUSES.includes(searchParams.status as BugReportStatus)
    ? (searchParams.status as BugReportStatus)
    : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where: Prisma.BugReportWhereInput = status ? { status } : {};

  const [reports, total, counts] = await Promise.all([
    db.bugReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            role: true,
            studentProfile: { select: { name: true } },
          },
        },
        images: {
          orderBy: { createdAt: "asc" },
          include: { upload: { select: { id: true, url: true, name: true } } },
        },
      },
    }),
    db.bugReport.count({ where }),
    db.bugReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
    Record<BugReportStatus, number>
  >;
  const allCount = counts.reduce((sum, c) => sum + c._count._all, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key: BugReportStatus | undefined; label: string; count: number }[] = [
    { key: undefined, label: "All", count: allCount },
    ...BUG_REPORT_STATUSES.map((s) => ({ key: s, label: BUG_REPORT_STATUS_META[s].label, count: countByStatus[s] ?? 0 })),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <Bug className="h-6 w-6" /> Bug reports
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Problems reported by students from the Support page. Screenshots are stored in the
        <span className="font-mono"> PROGGAA/bug-reports</span> Google Drive folder. Changing a status notifies the
        reporter, and your note is shown to them.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/bug-reports?status=${t.key}` : "/admin/bug-reports"}
              className={`sticker px-3 py-1.5 text-xs font-bold ${
                active ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"
              }`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </Link>
          );
        })}
      </div>

      {reports.length === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-8 text-center text-sm text-muted-foreground">
          No bug reports{status ? ` with status "${BUG_REPORT_STATUS_META[status].label}"` : ""}.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => {
            const reporterName =
              r.user.studentProfile?.name || `${r.user.firstName} ${r.user.lastName}`.trim() || "Unnamed user";
            const meta = BUG_REPORT_STATUS_META[r.status];
            return (
              <li key={r.id}>
                <details open={searchParams.open === r.id} className="comic-panel group bg-surface">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="break-words font-display text-sm font-bold text-foreground">{r.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {reporterName} · {formatDhakaDateTime(r.createdAt)}
                        {r.images.length > 0 && ` · ${r.images.length} image${r.images.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </summary>

                  <div className="border-t border-border/40 px-4 pb-4 pt-3">
                    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                      <dt className="font-bold text-foreground">Reporter</dt>
                      <dd className="min-w-0 break-words text-muted-foreground">
                        <Link href={`/admin/users/${r.user.id}`} className="font-semibold text-accent hover:underline">
                          {reporterName}
                        </Link>
                        {r.user.phone && ` · ${r.user.phone}`}
                        {r.user.email && ` · ${r.user.email}`} · {r.user.role.toLowerCase()}
                      </dd>
                      {r.pageUrl && (
                        <>
                          <dt className="font-bold text-foreground">Where</dt>
                          <dd className="min-w-0 break-words text-muted-foreground">{r.pageUrl}</dd>
                        </>
                      )}
                      {r.userAgent && (
                        <>
                          <dt className="font-bold text-foreground">Browser</dt>
                          <dd className="min-w-0 break-words font-mono text-[11px] text-muted-foreground">
                            {r.userAgent}
                          </dd>
                        </>
                      )}
                      {r.resolvedAt && (
                        <>
                          <dt className="font-bold text-foreground">Closed</dt>
                          <dd className="text-muted-foreground">{formatDhakaDateTime(r.resolvedAt)}</dd>
                        </>
                      )}
                    </dl>

                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">{r.description}</p>

                    {r.images.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {r.images.map(({ upload }) => (
                          <a
                            key={upload.id}
                            href={upload.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block aspect-video overflow-hidden rounded-lg border-2 border-border bg-muted"
                            title={`Open ${upload.name}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- auth-checked /api/files proxy, not optimizable */}
                            <img src={upload.url} alt={upload.name} loading="lazy" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}

                    <BugReportControls id={r.id} status={r.status} adminNote={r.adminNote} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <Pagination page={page} totalPages={totalPages} basePath="/admin/bug-reports" extraParams={{ status }} />
      </div>
    </div>
  );
}
