import { APPS_REPO, compareVersions } from "@/lib/apps";

// ---------------------------------------------------------------------
// The Proggaa apps' releases, through the GitHub API (repo APPS_REPO).
// Reading works without a token (public repo, 60 requests an hour per
// server); publishing and withdrawing need APPS_GITHUB_TOKEN, a GitHub
// token with "Actions: write" and "Contents: write" on that repo only.
// ---------------------------------------------------------------------

const API = `https://api.github.com/repos/${APPS_REPO}`;
const WORKFLOW = "release.yml";

export class GitHubError extends Error {}

function token(): string | null {
  return process.env.APPS_GITHUB_TOKEN?.trim() || null;
}

export function canManageReleases(): boolean {
  return token() !== null;
}

async function github<T>(path: string, init: RequestInit & { needsToken?: boolean } = {}): Promise<T> {
  const t = token();
  if (init.needsToken && !t) throw new GitHubError("APPS_GITHUB_TOKEN isn't set on the server, so the website can't change releases.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = (detail as { message?: string } | null)?.message ?? res.statusText;
    throw new GitHubError(`GitHub said: ${message} (${res.status})`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export type AppReleaseDTO = {
  id: number;
  version: string;
  tag: string;
  name: string;
  notes: string;
  publishedAt: string | null;
  isLatest: boolean;
  /** Withdrawn = marked pre-release: no longer "latest", so no new installs or updates get it. */
  withdrawn: boolean;
  draft: boolean;
  url: string;
  downloads: { windows: number; android: number };
};

type RawRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: { name: string; download_count: number }[];
};

/** Every release, newest first, with which one apps currently get. */
export async function listAppReleases(): Promise<AppReleaseDTO[]> {
  const [raw, latest] = await Promise.all([
    github<RawRelease[]>("/releases?per_page=30"),
    github<RawRelease>("/releases/latest").catch(() => null),
  ]);
  const count = (r: RawRelease, test: (name: string) => boolean) =>
    r.assets.filter((a) => test(a.name)).reduce((sum, a) => sum + a.download_count, 0);
  return raw.map((r) => ({
    id: r.id,
    version: r.tag_name.replace(/^v/, ""),
    tag: r.tag_name,
    name: r.name ?? r.tag_name,
    notes: (r.body ?? "").trim(),
    publishedAt: r.published_at,
    isLatest: latest?.id === r.id,
    withdrawn: r.prerelease,
    draft: r.draft,
    url: r.html_url,
    downloads: {
      windows: count(r, (n) => n.endsWith(".exe")),
      android: count(r, (n) => n.endsWith(".apk")),
    },
  }));
}

export type ReleaseRunDTO = {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  startedAt: string;
  url: string;
};

/** The most recent runs of the Release workflow (builds in progress show up here first). */
export async function listReleaseRuns(take = 5): Promise<ReleaseRunDTO[]> {
  const data = await github<{ workflow_runs: { id: number; display_title: string; status: string; conclusion: string | null; run_started_at: string; html_url: string }[] }>(
    `/actions/workflows/${WORKFLOW}/runs?per_page=${take}`
  );
  return data.workflow_runs.map((r) => ({
    id: r.id,
    title: r.display_title,
    status: r.status,
    conclusion: r.conclusion,
    startedAt: r.run_started_at,
    url: r.html_url,
  }));
}

/** Starts the Release workflow: it sets the version, tags it, builds both apps and publishes them. */
export async function dispatchRelease(version: string, notes: string): Promise<void> {
  await github(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    needsToken: true,
    body: JSON.stringify({ ref: "main", inputs: { version, notes } }),
  });
}

/**
 * Withdraws a release (pre-release, so GitHub's "latest" falls back to the
 * newest other release and apps stop being offered it) or puts it back.
 * Apps already on it keep it: an app never moves to a lower version.
 */
export async function setReleaseWithdrawn(id: number, withdrawn: boolean): Promise<void> {
  await github(`/releases/${id}`, {
    method: "PATCH",
    needsToken: true,
    body: JSON.stringify(withdrawn ? { prerelease: true, make_latest: "false" } : { prerelease: false }),
  });
  if (!withdrawn) {
    // Becomes "latest" again only if it is the newest of the published ones.
    const all = await github<RawRelease[]>("/releases?per_page=30");
    const newest = all
      .filter((r) => !r.draft && !r.prerelease)
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
    if (newest) {
      await github(`/releases/${newest.id}`, { method: "PATCH", needsToken: true, body: JSON.stringify({ make_latest: "true" }) });
    }
  }
}
