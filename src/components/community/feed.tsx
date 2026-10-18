"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, RefreshCw, Users } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { loadFeedPage, loadPost, peekNewestPost } from "@/server/actions/community-actions";
import type { FeedPage, FeedScope, GroupDTO, PersonCardDTO, PostDTO } from "@/server/services/community";
import { FollowButton, JoinGroupButton } from "./bits";
import { Composer, type ComposerConfig } from "./composer";
import { PostCard, PostSkeleton, type Viewer } from "./post-card";

export type { ComposerConfig } from "./composer";

const NETWORK_ERROR = "Couldn't reach Proggaa. Check your connection and try again.";
/** How often an open feed checks whether someone posted. */
const NEW_POSTS_POLL_MS = 45_000;
/** Suggestions slide in after this many posts, as on Facebook. */
const PEOPLE_AFTER = 3;
const GROUPS_AFTER = 8;

/** "People you may know": a row of cards that scrolls sideways. */
function PeopleRow({ people }: { people: PersonCardDTO[] }) {
  return (
    <section className="comic-panel bg-surface py-3 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0" aria-label="Heroes you may know">
      <div className="flex items-center justify-between px-3 sm:px-4">
        <h2 className="font-display text-base font-bold text-foreground">Heroes you may know</h2>
        <Link href="/community/discover" className="text-sm font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      <ul className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
        {people.map((p) => (
          <li key={p.id} className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-border/25 bg-surface">
            <Link href={`/community/u/${p.id}`} prefetch={false} className="block">
              <span className="flex h-28 items-center justify-center bg-gradient-to-br from-primary/25 to-accent/20">
                <Avatar fallbackClassName="bg-primary/15 text-2xl text-primary" src={p.avatarUrl} name={p.name} size={72} />
              </span>
              <span className="block truncate px-2.5 pt-2 text-sm font-bold text-foreground">{p.name}</span>
              <span className="block truncate px-2.5 text-xs text-muted-foreground">
                {p.followerCount} follower{p.followerCount === 1 ? "" : "s"}
              </span>
            </Link>
            <div className="p-2.5 [&_button]:w-full [&>span]:flex">
              <FollowButton userId={p.id} initialFollowing={p.isFollowing} size="sm" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Suggested groups", the same sideways row. */
function GroupsRow({ groups }: { groups: GroupDTO[] }) {
  return (
    <section className="comic-panel bg-surface py-3 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0" aria-label="Suggested study groups">
      <div className="flex items-center justify-between px-3 sm:px-4">
        <h2 className="font-display text-base font-bold text-foreground">Suggested study groups</h2>
        <Link href="/community/groups" className="text-sm font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      <ul className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => (
          <li key={g.id} className="flex w-52 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border/25 bg-surface">
            <Link href={`/community/groups/${g.slug}`} prefetch={false} className="block">
              <span className="halftone-dots flex h-20 items-center justify-center bg-primary text-primary-foreground">
                <Users className="h-8 w-8" aria-hidden="true" />
              </span>
              <span className="block truncate px-2.5 pt-2 text-sm font-bold text-foreground">{g.name}</span>
              <span className="block truncate px-2.5 text-xs text-muted-foreground">
                {g.topic} · {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
              </span>
            </Link>
            <div className="mt-auto p-2.5 [&_button]:w-full [&>span]:flex">
              <JoinGroupButton groupId={g.id} initialJoined={Boolean(g.myRole)} isOwner={g.myRole === "OWNER"} size="sm" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A feed of posts for one scope: the first page comes from the server with
 * the page, the rest load as the reader nears the end. A post you write
 * appears at the top at once; posts others write while you read are offered
 * behind a "New posts" button instead of shifting what you are reading.
 */
export function Feed({
  scope,
  initial,
  me,
  composer,
  suggestions,
  emptyTitle = "Nothing here yet",
  emptyBody = "Be the first to post.",
}: {
  scope: FeedScope;
  initial: FeedPage;
  me: Viewer;
  composer?: ComposerConfig;
  /** Shown between posts on screens without the right-hand column. */
  suggestions?: { people: PersonCardDTO[]; groups: GroupDTO[] };
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [posts, setPosts] = useState<PostDTO[]>(initial.posts);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState<null | "more" | "refresh">(null);
  const [error, setError] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  // The scope object is rebuilt on every server render; its JSON is what identifies it.
  const scopeKey = JSON.stringify(scope);
  const newestId = posts[0]?.id ?? null;

  const load = useCallback(
    async (mode: "more" | "refresh") => {
      if (busy.current) return;
      busy.current = true;
      setLoading(mode);
      setError(null);
      try {
        const res = await loadFeedPage(JSON.parse(scopeKey) as FeedScope, mode === "more" ? cursor : null);
        if (!res.ok) {
          setError(res.error);
        } else if (mode === "refresh") {
          setPosts(res.posts);
          setCursor(res.nextCursor);
          setHasNew(false);
        } else {
          // A post can shift between pages while someone is reading; never show it twice.
          setPosts((prev) => [...prev, ...res.posts.filter((p) => !prev.some((x) => x.id === p.id))]);
          setCursor(res.nextCursor);
        }
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        busy.current = false;
        setLoading(null);
      }
    },
    [cursor, scopeKey]
  );

  // Load the next page when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load("more");
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, error, load]);

  // Every so often (only while the tab is visible), ask whether something newer was posted.
  useEffect(() => {
    const s = JSON.parse(scopeKey) as FeedScope;
    if (s.type === "trending" || s.type === "saved" || s.type === "search") return;
    let stopped = false;
    async function check() {
      if (document.hidden || stopped) return;
      try {
        const res = await peekNewestPost(s);
        if (!stopped && res.ok && res.id && res.id !== newestId) setHasNew(true);
      } catch {
        // A missed check is fine; the next one catches up.
      }
    }
    const timer = window.setInterval(check, NEW_POSTS_POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [scopeKey, newestId]);

  /** Puts a post that was just written at the top without reloading the feed. */
  async function prepend(postId: string) {
    try {
      const res = await loadPost(postId);
      if (res.ok) {
        setPosts((prev) => [res.post, ...prev.filter((p) => p.id !== res.post.id)]);
        return;
      }
    } catch {
      // Fall back to reloading the first page.
    }
    void load("refresh");
  }

  function showNew() {
    void load("refresh");
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div ref={top} className="scroll-mt-20" />
      {composer && <Composer config={composer} onCreated={(id) => void prepend(id)} />}

      {hasNew && (
        <div className="pointer-events-none sticky top-16 z-20 flex justify-center lg:top-4">
          <button
            type="button"
            onClick={showNew}
            className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-card-hover animate-in fade-in-0 slide-in-from-top-2"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" /> New posts
          </button>
        </div>
      )}

      {loading === "refresh" && (
        <>
          <p role="status" className="sr-only">Updating...</p>
          <PostSkeleton />
        </>
      )}

      {posts.map((post, i) => (
        <div key={post.id} className="space-y-3 sm:space-y-4">
          <PostCard
            post={post}
            me={me}
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            onShared={(id) => {
              if (composer) void prepend(id);
            }}
          />
          {suggestions && i === PEOPLE_AFTER - 1 && suggestions.people.length > 0 && (
            <div className="xl:hidden">
              <PeopleRow people={suggestions.people} />
            </div>
          )}
          {suggestions && i === GROUPS_AFTER - 1 && suggestions.groups.length > 0 && (
            <div className="xl:hidden">
              <GroupsRow groups={suggestions.groups} />
            </div>
          )}
        </div>
      ))}

      {posts.length === 0 && !loading && !error && (
        <div className="comic-panel flex flex-col items-center gap-3 bg-surface p-8 text-center sm:flex-row sm:text-left">
          <ProggyMascot state="thinking" className="h-20 w-20 shrink-0" />
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
          </div>
        </div>
      )}
      {posts.length > 0 && posts.length < PEOPLE_AFTER && suggestions && suggestions.people.length > 0 && (
        <div className="xl:hidden">
          <PeopleRow people={suggestions.people} />
        </div>
      )}

      {error && (
        <div role="alert" className="comic-panel flex flex-wrap items-center justify-between gap-3 bg-surface p-4">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <button
            type="button"
            onClick={() => void load(posts.length ? "more" : "refresh")}
            className="comic-btn flex h-10 items-center gap-1.5 border border-border/60 bg-surface px-4 text-sm font-bold text-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {cursor && !error && (
        <div ref={sentinel}>
          {loading === "more" ? (
            <PostSkeleton />
          ) : (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={() => void load("more")}
                className="comic-btn flex h-11 items-center gap-2 border border-border/60 bg-surface px-5 text-sm font-bold text-foreground"
              >
                Show more posts
              </button>
            </div>
          )}
        </div>
      )}
      {!cursor && posts.length > 5 && <p className="py-4 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
    </div>
  );
}
