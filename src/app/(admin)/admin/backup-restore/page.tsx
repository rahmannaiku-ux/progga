import { Download, ShieldAlert, DatabaseBackup } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";

export default async function BackupRestorePage() {
  await requireRole("ADMIN");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Backup & restore
      </h1>

      <div className="glass-panel mt-6 p-6">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-accent" />
          <h2 className="font-display text-sm font-bold text-foreground">
            Data export
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Downloads a JSON snapshot of users, missions, enrollments,
          certificates, and categories — useful for reporting, spot-checks,
          or migrating data into another system.
        </p>
        <a
          href="/api/admin/reports"
          className="comic-btn mt-4 inline-flex items-center gap-1.5 bg-accent px-4 py-2 text-xs font-bold text-accent-foreground"
        >
          <Download className="h-3.5 w-3.5" /> Download JSON export
        </a>
      </div>

      <div className="glass-panel mt-6 p-6">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-accent" />
          <h2 className="font-display text-sm font-bold text-foreground">
            Full database backup
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The JSON export above is <em>not</em> a full backup — it omits
          binary content, exact relational structure, and anything not
          explicitly selected. For real disaster recovery, back up the
          Postgres database directly:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Supabase: enable automated daily backups and point-in-time
            recovery from Project Settings &gt; Database &gt; Backups — this
            is almost always better than an app-level export.
          </li>
          <li>
            Self-hosted / Docker: schedule <code className="font-mono text-xs">pg_dump</code>{" "}
            against <code className="font-mono text-xs">DATABASE_URL</code> to
            an off-box destination (S3, another host).
          </li>
          <li>
            Uploaded files (PDFs, videos, avatars) live in Uploadthing —
            back those up separately via their API/dashboard.
          </li>
        </ul>
      </div>

      <div className="glass-panel mt-6 flex items-start gap-3 border-danger/30 p-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <h2 className="font-display text-sm font-bold text-foreground">
            Why there's no "restore" button here
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An in-app restore that accepts an uploaded file and writes it
            into the live database is a serious risk — a corrupted or
            malicious file could silently overwrite real user data with no
            undo. Restoring from a backup is intentionally an
            infrastructure-level operation (Postgres restore tooling or your
            provider's snapshot UI), performed by someone with direct
            database access, not a self-service button in the app.
          </p>
        </div>
      </div>
    </div>
  );
}
