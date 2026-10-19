import { AlertTriangle, Download, Monitor, Smartphone } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { getSetting } from "@/lib/config/settings-service";
import { formatDhakaDate } from "@/lib/timezone";
import { APPS_RELEASES_URL, compareVersions, nextPatch } from "@/lib/apps";
import {
  canManageReleases,
  listAppReleases,
  listReleaseRuns,
  type AppReleaseDTO,
  type ReleaseRunDTO,
} from "@/server/services/app-releases";
import { MinimumVersionForm, PublishVersionForm, ReleaseRuns, WithdrawReleaseButton } from "@/components/admin-dashboard/app-releases";

export const metadata = { title: "Apps · Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin -> Apps: version control for the Windows and Android apps. Every
 * release, which one installed apps are offered, downloads, publishing a new
 * version, withdrawing a broken one, and the oldest version allowed.
 */
export default async function AdminAppsPage() {
  await requireRole("ADMIN");
  const canManage = canManageReleases();
  const [releases, runs, minAndroid, minWindows] = await Promise.all([
    listAppReleases().catch(() => null as AppReleaseDTO[] | null),
    listReleaseRuns(5).catch(() => [] as ReleaseRunDTO[]),
    getSetting("apps.minVersionAndroid"),
    getSetting("apps.minVersionWindows"),
  ]);
  const latest = releases?.find((r) => r.isLatest) ?? null;
  const highest = (releases ?? []).map((r) => r.version).sort(compareVersions).pop() ?? "1.0.0";
  const totals = (releases ?? []).reduce((t, r) => ({ windows: t.windows + r.downloads.windows, android: t.android + r.downloads.android }), {
    windows: 0,
    android: 0,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Smartphone className="h-6 w-6 text-primary" aria-hidden="true" /> Apps
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version control for the Proggaa apps for Windows and Android. A new version is built on GitHub and offered to
          everyone through the apps&apos; built-in updater.
        </p>
      </div>

      {!canManage && (
        <div className="comic-panel flex gap-3 border-danger/40 bg-danger/5 p-4 text-sm text-foreground">
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <p>
            Read-only: the server has no <code className="font-mono text-xs">APPS_GITHUB_TOKEN</code>, so publishing,
            withdrawing and minimum versions are switched off. Add a GitHub token with Actions and Contents write access
            to the <code className="font-mono text-xs">proggaa-apps</code> repo in Vercel.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="comic-panel bg-surface p-4">
          <p className="text-xs font-bold text-muted-foreground">Live version</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-foreground">{latest?.version ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{latest?.publishedAt ? `Since ${formatDhakaDate(latest.publishedAt, { dateStyle: "medium" })}` : "Nothing published yet"}</p>
        </div>
        <div className="comic-panel bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Android downloads
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold text-foreground">{totals.android}</p>
          <p className="text-xs text-muted-foreground">All versions</p>
        </div>
        <div className="comic-panel bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> Windows downloads
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold text-foreground">{totals.windows}</p>
          <p className="text-xs text-muted-foreground">All versions</p>
        </div>
      </div>

      <section className="comic-panel bg-surface p-5" aria-labelledby="publish">
        <h2 id="publish" className="font-display text-lg font-bold text-foreground">Publish a new version</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Builds, signs and publishes both apps from the latest code (about 15 minutes). Installed apps then offer it
          with your notes. Only needed when the apps themselves change: website changes reach the apps straight away.
        </p>
        <PublishVersionForm suggested={nextPatch(highest)} disabled={!canManage} />
      </section>

      <section className="comic-panel bg-surface p-5" aria-labelledby="builds">
        <h2 id="builds" className="font-display text-lg font-bold text-foreground">Builds</h2>
        <div className="mt-2">
          <ReleaseRuns initial={runs} />
        </div>
      </section>

      <section className="comic-panel bg-surface p-5" aria-labelledby="releases">
        <div className="flex items-center justify-between gap-3">
          <h2 id="releases" className="font-display text-lg font-bold text-foreground">Releases</h2>
          <a href={APPS_RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-accent hover:underline">
            Open on GitHub
          </a>
        </div>
        {releases === null ? (
          <p className="mt-3 text-sm text-danger">Couldn&apos;t reach GitHub right now. Refresh in a minute.</p>
        ) : releases.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No releases yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/15">
            {releases.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold text-foreground">{r.version}</span>
                    {r.isLatest && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">Live</span>}
                    {r.withdrawn && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">Withdrawn</span>}
                    {r.draft && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Draft</span>}
                    <span className="text-xs text-muted-foreground">
                      {r.publishedAt ? formatDhakaDate(r.publishedAt, { dateStyle: "medium" }) : ""}
                    </span>
                  </p>
                  {r.notes && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <Download className="h-3 w-3" aria-hidden="true" />
                    <span>Android {r.downloads.android}</span>
                    <span>Windows {r.downloads.windows}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">
                      Files
                    </a>
                  </p>
                </div>
                {!r.draft && <WithdrawReleaseButton id={r.id} version={r.version} withdrawn={r.withdrawn} disabled={!canManage} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="comic-panel bg-surface p-5" aria-labelledby="minimum">
        <h2 id="minimum" className="font-display text-lg font-bold text-foreground">Oldest version allowed</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Apps older than this show a full-screen &quot;Time to update&quot; message with an Update now button instead of
          the site. Use it after an important fix. Leave empty for no minimum.
        </p>
        <MinimumVersionForm android={String(minAndroid ?? "")} windows={String(minWindows ?? "")} disabled={!canManage} />
      </section>
    </div>
  );
}
