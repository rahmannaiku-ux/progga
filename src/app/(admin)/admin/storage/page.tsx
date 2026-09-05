import Link from "next/link";
import {
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  User as UserIcon,
  FileText,
  Award,
  Users as UsersIcon,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { getDriveQuota } from "@/lib/storage/google-drive";
import { formatBytes, getQuotaWarning } from "@/lib/storage/quota-thresholds";
import { disconnectGoogleDrive, adminDeleteUpload } from "@/server/actions/storage-actions";
import { DisconnectDriveButton } from "@/components/admin-dashboard/disconnect-drive-button";
import type { UploadContext } from "@prisma/client";

// Course-content categories (LESSON_RESOURCE) are a deliberately
// separate system and never appear on this page — see the
// storage-separation note in lib/storage/index.ts.
const CATEGORIES: { context: UploadContext; label: string; icon: typeof UserIcon }[] = [
  { context: "AVATAR", label: "Profile Pictures", icon: UserIcon },
  { context: "ASSIGNMENT_SUBMISSION", label: "Assignments", icon: FileText },
  { context: "CERTIFICATE", label: "Certificates", icon: Award },
  { context: "COMMUNITY_IMAGE", label: "Community Uploads", icon: UsersIcon },
  { context: "OTHER", label: "Other Files", icon: FolderOpen },
];

export default async function AdminStoragePage({
  searchParams,
}: {
  searchParams: { error?: string; connected?: string; category?: string; q?: string };
}) {
  await requireRole("ADMIN");

  const connection = await db.googleDriveConnection.findUnique({ where: { id: "singleton" } });
  const isConnected = connection?.status === "CONNECTED";

  const [categoryBreakdown, recentFiles] = await Promise.all([
    db.upload.groupBy({
      by: ["context"],
      where: { context: { in: CATEGORIES.map((c) => c.context) } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    db.upload.findMany({
      where: {
        context: { in: CATEGORIES.map((c) => c.context) },
        ...(searchParams.category ? { context: searchParams.category as UploadContext } : {}),
        ...(searchParams.q
          ? { name: { contains: searchParams.q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { uploader: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ]);

  const breakdownByContext = Object.fromEntries(
    categoryBreakdown.map((b) => [b.context, { count: b._count._all, bytes: b._sum.sizeBytes ?? 0 }])
  );

  let quota: { usageBytes: number | null; limitBytes: number | null } | null = null;
  let quotaError: string | null = null;
  if (isConnected) {
    try {
      quota = await getDriveQuota();
    } catch {
      quotaError = "Couldn't reach Google Drive to check storage usage right now.";
    }
  }
  const warning = quota?.usageBytes != null ? getQuotaWarning(quota.usageBytes, quota.limitBytes) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <HardDrive className="h-6 w-6" /> Proggaa Storage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Student/user uploads (profile pictures, assignments, certificates, community images) are
          stored in one dedicated Google Drive account. Course content — YouTube videos and lesson
          Slides/resources — is a separate system and isn't shown here.
        </p>
      </div>

      {searchParams.error && (
        <div className="comic-panel flex items-center gap-2 border-danger/30 bg-danger/10 p-4 text-sm font-semibold text-danger">
          <XCircle className="h-4 w-4 shrink-0" /> {decodeURIComponent(searchParams.error)}
        </div>
      )}
      {searchParams.connected && (
        <div className="comic-panel flex items-center gap-2 bg-xp/15 p-4 text-sm font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-xp" /> Google Drive connected successfully.
        </div>
      )}
      {warning && (
        <div
          className={
            "comic-panel flex items-center gap-2 p-4 text-sm font-semibold " +
            (warning.level === "critical"
              ? "bg-danger/10 text-danger"
              : "bg-xp/15 text-foreground")
          }
        >
          <AlertTriangle className="h-4 w-4 shrink-0" /> {warning.message}
        </div>
      )}

      {/* Connection card */}
      <div className="comic-panel bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="sticker flex h-11 w-11 items-center justify-center bg-primary/10 text-primary">
              <HardDrive className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-bold text-foreground">Google Drive</p>
              <p
                className={
                  "flex items-center gap-1.5 text-xs font-semibold " +
                  (isConnected ? "text-xp-foreground" : "text-muted-foreground")
                }
              >
                {isConnected ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-xp" /> Connected
                  </>
                ) : connection?.status === "ERROR" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-danger" /> Connection error — reconnect required
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Not connected
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {isConnected ? (
              <>
                <a
                  href="https://drive.google.com/drive/my-drive"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="comic-btn flex items-center gap-1.5 bg-surface px-4 py-2 text-xs font-bold text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Google Drive
                </a>
                <DisconnectDriveButton action={disconnectGoogleDrive} />
              </>
            ) : (
              <a
                href="/api/admin/storage/google/connect"
                className="comic-btn bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
              >
                Connect Google Drive
              </a>
            )}
          </div>
        </div>

        {connection?.connectedEmail && (
          <p className="mt-4 text-sm text-muted-foreground">
            Connected account: <span className="font-mono text-foreground">{connection.connectedEmail}</span>
          </p>
        )}

        {isConnected && (
          <div className="mt-4">
            {quotaError ? (
              <p className="text-xs text-muted-foreground">{quotaError}</p>
            ) : quota?.usageBytes != null ? (
              <>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: quota.limitBytes
                        ? `${Math.min(100, (quota.usageBytes / quota.limitBytes) * 100)}%`
                        : "100%",
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formatBytes(quota.usageBytes)}
                  {quota.limitBytes ? ` / ${formatBytes(quota.limitBytes)}` : " used (no fixed limit reported)"}
                  {" · "}
                  <span title="Reported directly by the Google Drive API; not exact byte-for-byte for this app's files specifically.">
                    approximate
                  </span>
                </p>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORIES.map((cat) => {
          const stats = breakdownByContext[cat.context] ?? { count: 0, bytes: 0 };
          return (
            <div key={cat.context} className="comic-panel bg-surface p-4 text-center">
              <cat.icon className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-2 font-display text-lg font-extrabold text-foreground">{stats.count}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">{cat.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">~{formatBytes(stats.bytes)}</p>
            </div>
          );
        })}
      </div>

      {/* File browser */}
      <div className="comic-panel bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-bold text-foreground">Managed files</h2>
          <form className="flex flex-wrap gap-2" action="/admin/storage">
            <select
              name="category"
              defaultValue={searchParams.category ?? ""}
              className="h-11 rounded-lg bg-surface px-3 text-base text-foreground md:h-auto md:rounded-none md:py-1.5 md:text-xs"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.context} value={c.context}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="Search by filename..."
              className="h-11 rounded-lg bg-surface px-3 text-base text-foreground md:h-auto md:rounded-none md:py-1.5 md:text-xs"
            />
            <button
              type="submit"
              className="comic-btn h-11 bg-primary px-3 text-sm font-bold text-primary-foreground md:h-auto md:py-1.5 md:text-xs"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Mobile: cards, one per file. The desktop table's 7 columns
            genuinely need horizontal scroll at that density, but each
            file's fields fit comfortably stacked below md, so cards
            avoid forcing that scroll on narrow screens entirely. */}
        <div className="mt-4 md:hidden">
          {recentFiles.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No files match this filter.
            </p>
          ) : (
            <ul className="divide-y divide-border/10">
              {recentFiles.map((f) => (
                <li key={f.id} className="space-y-1.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {f.name}
                    </p>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 items-center text-xs font-bold text-primary hover:text-primary/80"
                      >
                        View
                      </a>
                      <form
                        action={async () => {
                          "use server";
                          await adminDeleteUpload(f.id);
                        }}
                      >
                        <button
                          type="submit"
                          aria-label={`Delete ${f.name}`}
                          className="flex h-11 w-11 items-center justify-center text-danger hover:text-danger/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIES.find((c) => c.context === f.context)?.label ?? f.context}
                    {" · "}
                    {f.uploader.firstName} {f.uploader.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)}
                    {" · "}
                    {f.provider === "GOOGLE_DRIVE" ? "Drive" : "Backup"}
                    {" · "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(f.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Desktop: unchanged table, scoped to md and up. Data-dense
            enough (7 columns) that it genuinely needs horizontal
            scroll rather than cards — kept, with touch scrolling. */}
        <div className="mt-4 hidden overflow-x-auto [-webkit-overflow-scrolling:touch] md:block">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/10 text-muted-foreground">
                <th className="pb-2 pr-3 font-semibold">File</th>
                <th className="pb-2 pr-3 font-semibold">Category</th>
                <th className="pb-2 pr-3 font-semibold">Uploaded by</th>
                <th className="pb-2 pr-3 font-semibold">Size</th>
                <th className="pb-2 pr-3 font-semibold">Provider</th>
                <th className="pb-2 pr-3 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentFiles.map((f) => (
                <tr key={f.id} className="border-b border-border/5">
                  <td className="max-w-[12rem] truncate py-2 pr-3 text-foreground">{f.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {CATEGORIES.find((c) => c.context === f.context)?.label ?? f.context}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {f.uploader.firstName} {f.uploader.lastName}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatBytes(f.sizeBytes)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {f.provider === "GOOGLE_DRIVE" ? "Drive" : "Backup"}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(f.createdAt)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-primary hover:text-primary/80"
                      >
                        View
                      </a>
                      <form
                        action={async () => {
                          "use server";
                          await adminDeleteUpload(f.id);
                        }}
                      >
                        <button
                          type="submit"
                          aria-label={`Delete ${f.name}`}
                          className="text-danger hover:text-danger/80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {recentFiles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No files match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/admin/dashboard" className="font-semibold text-primary hover:text-primary/80">
          ← Back to admin dashboard
        </Link>
      </p>
    </div>
  );
}
