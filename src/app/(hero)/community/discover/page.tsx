import Link from "next/link";
import { Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { displayName } from "@/lib/community/rules";
import { Avatar } from "@/components/shared/avatar";
import { FollowButton } from "@/components/community/bits";
import { Feed } from "@/components/community/feed";
import { GroupCard } from "@/components/community/group-card";
import { findPeople, getFeedPage, listGroups, type FeedScope, type PersonCardDTO } from "@/server/services/community";

export const metadata = { title: "Discover · Community" };

function People({ people }: { people: PersonCardDTO[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {people.map((p) => (
        <li key={p.id} className="comic-panel flex items-center gap-3 bg-surface p-3">
          <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={44} />
          <div className="min-w-0 flex-1">
            <Link href={`/community/u/${p.id}`} prefetch={false} className="block truncate text-sm font-bold text-foreground hover:underline">
              {p.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {p.headline ?? (p.isMentor ? "Mentor" : "Hero")} · {p.followerCount} follower{p.followerCount === 1 ? "" : "s"}
            </p>
          </div>
          <FollowButton userId={p.id} initialFollowing={p.isFollowing} size="sm" />
        </li>
      ))}
    </ul>
  );
}

/** Search posts, people and groups; with no search, suggestions. */
export default async function DiscoverPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getCurrentUser();
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const searching = q.length >= 2;
  const postScope: FeedScope = searching ? { type: "search", query: q } : { type: "trending" };

  const [people, groups, posts] = await Promise.all([
    findPeople(user, searching ? q : null, 8),
    listGroups(user, { query: searching ? q : null, take: 6 }),
    getFeedPage(user, postScope),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form action="/community/discover" role="search" className="flex items-center gap-2">
        <label htmlFor="community-search" className="sr-only">
          Search the community
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-4 shadow-card focus-within:ring-2 focus-within:ring-accent">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="community-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={80}
            placeholder="Search Proggaa Community"
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <button type="submit" className="comic-btn h-11 shrink-0 bg-primary px-4 text-sm font-bold text-primary-foreground">
          Search
        </button>
      </form>

      {searchParams.q && !searching && <p className="text-sm text-muted-foreground">Type at least two letters to search.</p>}

      <section aria-labelledby="discover-people">
        <h2 id="discover-people" className="font-display text-lg font-extrabold text-foreground">
          {searching ? "Heroes" : "Heroes to follow"}
        </h2>
        <div className="mt-3">
          {people.length ? <People people={people} /> : <p className="text-sm text-muted-foreground">{searching ? `No one matches "${q}".` : "You already follow everyone active here."}</p>}
        </div>
      </section>

      <section aria-labelledby="discover-groups">
        <div className="flex items-center justify-between gap-3">
          <h2 id="discover-groups" className="font-display text-lg font-extrabold text-foreground">
            {searching ? "Groups" : "Popular study groups"}
          </h2>
          <Link href="/community/groups" className="text-xs font-bold text-accent hover:underline">
            All groups
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
        {groups.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{searching ? `No group matches "${q}".` : "No study groups yet. Start the first one."}</p>}
      </section>

      <section aria-labelledby="discover-posts">
        <h2 id="discover-posts" className="font-display text-lg font-extrabold text-foreground">
          {searching ? "Posts" : "Trending posts"}
        </h2>
        <div className="mt-3">
          <Feed
            key={searching ? `q:${q}` : "trending"}
            scope={postScope}
            initial={posts}
            me={{ name: displayName(user), avatarUrl: user.avatarUrl }}
            emptyTitle={searching ? `No posts match "${q}"` : "Nothing is trending yet"}
            emptyBody={searching ? "Try a different word." : "Posts with the most reactions and comments show up here."}
          />
        </div>
      </section>
    </div>
  );
}
