import Link from "next/link";
import { Search as SearchIcon, Rocket, BookOpen, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { searchContent, type SearchScope } from "@/server/services/search-service";
import { cn } from "@/lib/utils";

const TABS: { key: SearchScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missions", label: "Missions" },
  { key: "lessons", label: "Lessons" },
];

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent/20 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function ResultList({
  title,
  hits,
  q,
  icon: Icon,
  tone,
}: {
  title: string;
  hits: { id: string; title: string; meta: string; href: string }[];
  q: string;
  icon: typeof Rocket;
  tone: string;
}) {
  if (hits.length === 0) return null;
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title} ({hits.length})
      </p>
      <div className="mt-2 space-y-2">
        {hits.map((h) => (
          <Link
            key={h.id}
            href={h.href}
            prefetch={false}
            className="hover-glow-card comic-panel group flex items-center gap-3 bg-surface p-3.5"
          >
            <span className={cn("sticker flex h-9 w-9 shrink-0 items-center justify-center", tone)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                <Highlight text={h.title} q={q} />
              </p>
              <p className="truncate text-xs text-muted-foreground">{h.meta}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "all";
  const user = await getCurrentUser();

  const { missions, lessons } = await searchContent(user.id, q, { scope: tab, take: 20 });
  const totalCount = missions.length + lessons.length;

  return (
    <div className="mx-auto max-w-2xl">
      <form method="GET" role="search" className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search missions and lessons..."
          aria-label="Search missions and lessons"
          autoFocus
          maxLength={100}
          className="h-14 w-full rounded-2xl border border-border/20 bg-surface pl-12 pr-28 text-base text-foreground shadow-card placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input type="hidden" name="tab" value={tab} />
        <button
          type="submit"
          className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/search?q=${encodeURIComponent(q)}&tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "sticker-badge px-3 py-1.5 text-xs font-bold",
              t.key === tab ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
        {q && totalCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {totalCount} result{totalCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!q ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Start typing to search missions and lessons.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tip: press <kbd className="rounded border border-border/20 bg-muted px-1 font-mono">Ctrl K</kbd> or{" "}
            <kbd className="rounded border border-border/20 bg-muted px-1 font-mono">/</kbd> anywhere to search.
          </p>
        </div>
      ) : totalCount === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <p className="font-display text-lg font-bold text-foreground">No results for &ldquo;{q}&rdquo;</p>
          <p className="mt-1 text-sm text-muted-foreground">Check the spelling or try a shorter search term.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <ResultList title="Missions" hits={missions} q={q} icon={Rocket} tone="bg-primary/15 text-primary" />
          <ResultList title="Lessons" hits={lessons} q={q} icon={BookOpen} tone="bg-accent/15 text-accent" />
        </div>
      )}
    </div>
  );
}
