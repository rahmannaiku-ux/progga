"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, BookOpen, Clock, CornerDownLeft, Loader2, Rocket, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { heroNav } from "@/lib/nav-config";
import { quickSearchAction } from "@/server/actions/search-actions";

const RECENT_KEY = "proggaa:recent-searches";
const MAX_RECENT = 5;
const DEBOUNCE_MS = 200;

type Item = {
  key: string;
  group: "Recent" | "Go to" | "Missions" | "Lessons";
  label: string;
  meta?: string;
  href: string;
  icon: LucideIcon;
  /** Recent searches re-run the query instead of navigating. */
  query?: string;
};

const PAGES = heroNav.flatMap((s) => s.items);

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode etc.) — recents are a nicety only
  }
}

/** Bolds the first case-insensitive occurrence of `q` in `text`. */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent/20 px-0.5 font-bold text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Same portal-target fix as components/ui/dialog.tsx: mount inside the themed wrapper. */
function useThemeContainer() {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);
  return container;
}

/**
 * Top-bar search: a compact trigger that opens a command palette with
 * live mission/lesson results, page shortcuts and recent searches.
 * Opens on Ctrl/⌘+K or "/" (when not typing in a field); ↑/↓ + Enter
 * to pick, Esc to close. "See all results" falls through to /search.
 */
export function SearchCommand() {
  const router = useRouter();
  const container = useThemeContainer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ missions: Item[]; lessons: Item[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [isMac, setIsMac] = useState(false);
  const requestId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setRecent(readRecent());
    else {
      setQuery("");
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  const q = query.trim();

  // Debounced live search; stale responses are dropped via requestId.
  useEffect(() => {
    if (!q) {
      requestId.current++;
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await quickSearchAction(q);
        if (id !== requestId.current) return;
        setResults({
          missions: res.missions.map((m) => ({ key: `m-${m.id}`, group: "Missions", label: m.title, meta: m.meta, href: m.href, icon: Rocket })),
          lessons: res.lessons.map((l) => ({ key: `l-${l.id}`, group: "Lessons", label: l.title, meta: l.meta, href: l.href, icon: BookOpen })),
        });
      } catch {
        if (id === requestId.current) setResults({ missions: [], lessons: [] });
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const lower = q.toLowerCase();
    const pages: Item[] = PAGES.filter((p) => !lower || p.label.toLowerCase().includes(lower))
      .slice(0, q ? 4 : 6)
      .map((p) => ({ key: `p-${p.href}`, group: "Go to", label: p.label, href: p.href, icon: p.icon }));
    if (!q) {
      const recents: Item[] = recent.map((r) => ({ key: `r-${r}`, group: "Recent", label: r, href: "", icon: Clock, query: r }));
      return [...recents, ...pages];
    }
    return [...(results?.missions ?? []), ...(results?.lessons ?? []), ...pages];
  }, [q, recent, results]);

  useEffect(() => setActive(0), [items]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (href: string) => {
      if (q) saveRecent(q);
      setOpen(false);
      router.push(href);
    },
    [q, router]
  );

  const seeAll = useCallback(() => {
    if (!q) return;
    go(`/search?q=${encodeURIComponent(q)}`);
  }, [q, go]);

  function choose(item: Item) {
    if (item.query !== undefined) setQuery(item.query);
    else go(item.href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if ((e.metaKey || e.ctrlKey || !item) && q) seeAll();
      else if (item) choose(item);
    }
  }

  const groups = items.reduce<{ name: Item["group"]; entries: { item: Item; index: number }[] }[]>((acc, item, index) => {
    const last = acc[acc.length - 1];
    if (last && last.name === item.group) last.entries.push({ item, index });
    else acc.push({ name: item.group, entries: [{ item, index }] });
    return acc;
  }, []);

  const noContentHits = q && !loading && results && results.missions.length + results.lessons.length === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Search"
          className={cn(
            "group flex h-10 items-center gap-2.5 rounded-full border border-border/20 bg-surface text-sm text-muted-foreground shadow-card transition-all",
            "hover:border-accent/40 hover:text-foreground hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "w-full max-w-sm justify-start px-4"
          )}
        >
          <Search className="h-4 w-4 shrink-0 transition-colors group-hover:text-accent" />
          <span className="truncate">Search missions, lessons, pages…</span>
          <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded-md border border-border/20 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground md:flex">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input")?.focus();
          }}
          className={cn(
            "fixed left-1/2 top-[8dvh] z-50 flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden",
            "comic-panel bg-surface p-0 shadow-2xl",
            "data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 motion-safe:transition-[opacity,transform] motion-safe:duration-150"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>

          <div className="flex items-center gap-3 border-b border-border/10 px-4">
            {loading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search missions, lessons, pages…"
              aria-label="Search"
              aria-controls="search-command-list"
              aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
              role="combobox"
              aria-expanded
              autoComplete="off"
              spellCheck={false}
              maxLength={100}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="hidden rounded-md border border-border/20 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:block">
                Esc
              </kbd>
            )}
          </div>

          <div ref={listRef} id="search-command-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
            {noContentHits && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No missions or lessons match <span className="font-semibold text-foreground">&ldquo;{q}&rdquo;</span>.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.name} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.name}</p>
                {g.entries.map(({ item, index }) => {
                  const Icon = item.icon;
                  const isActive = index === active;
                  return (
                    <button
                      key={item.key}
                      id={`search-item-${index}`}
                      data-index={index}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(index)}
                      onClick={() => choose(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        isActive ? "bg-accent/10" : "hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          item.group === "Missions" && "bg-primary/15 text-primary",
                          item.group === "Lessons" && "bg-accent/15 text-accent",
                          (item.group === "Go to" || item.group === "Recent") && "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          <Highlight text={item.label} q={q} />
                        </span>
                        {item.meta && <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>}
                      </span>
                      {isActive && <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {q && (
            <button
              type="button"
              onClick={seeAll}
              className="flex items-center justify-between gap-2 border-t border-border/10 px-5 py-3 text-sm font-semibold text-accent hover:bg-muted/50"
            >
              <span className="truncate">See all results for &ldquo;{q}&rdquo;</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          )}

          <div className="hidden items-center gap-4 border-t border-border/10 px-5 py-2 text-[11px] text-muted-foreground sm:flex">
            <span><kbd className="font-mono font-semibold">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono font-semibold">↵</kbd> open</span>
            <span><kbd className="font-mono font-semibold">{isMac ? "⌘" : "Ctrl"}+↵</kbd> all results</span>
            <span className="ml-auto"><kbd className="font-mono font-semibold">Esc</kbd> close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
