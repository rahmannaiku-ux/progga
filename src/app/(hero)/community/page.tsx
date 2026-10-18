import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/community/rules";
import { Feed } from "@/components/community/feed";
import { CommunitySidebar } from "@/components/community/sidebar";
import { getFeedPage, getSidebar, getTopHelpers, listGroups, type FeedScope } from "@/server/services/community";

export const metadata = { title: "Community" };

const TABS = [
  { key: "for-you", label: "For you", scope: { type: "all" } },
  { key: "following", label: "Following", scope: { type: "following" } },
  { key: "trending", label: "Trending", scope: { type: "trending" } },
  { key: "questions", label: "Questions", scope: { type: "questions" } },
] as const satisfies readonly { key: string; label: string; scope: FeedScope }[];

const EMPTY: Record<(typeof TABS)[number]["key"], { title: string; body: string }> = {
  "for-you": { title: "The community is quiet", body: "Write the first post. Ask a question, share a win, or start a poll." },
  following: { title: "Nothing from the people you follow yet", body: "Follow some heroes or join a study group and their posts will show up here." },
  trending: { title: "Nothing is trending yet", body: "Posts with the most reactions and comments in the last two weeks appear here." },
  questions: { title: "No questions yet", body: "Stuck on something? Ask it. Marking a useful answer earns the helper XP." },
};

/** Proggaa Community: the feed. */
export default async function CommunityFeedPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getCurrentUser();
  const tab = TABS.find((t) => t.key === searchParams.tab) ?? TABS[0];

  const [initial, sidebar, helpers, suggestedGroups] = await Promise.all([
    getFeedPage(user, tab.scope),
    getSidebar(user),
    getTopHelpers(),
    listGroups(user, { take: 8 }),
  ]);
  const me = { name: displayName(user), avatarUrl: user.avatarUrl };

  return (
    <div className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="mx-auto w-full min-w-0 max-w-[680px] space-y-3">
        <h1 className="sr-only">Proggaa Community</h1>
        <div role="tablist" aria-label="Feed" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "for-you" ? "/community" : `/community?tab=${t.key}`}
              role="tab"
              aria-selected={t.key === tab.key}
              className={cn(
                "flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                t.key === tab.key ? "bg-primary/15 text-primary" : "bg-surface text-foreground hover:bg-muted"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <Feed
          key={tab.key}
          scope={tab.scope}
          initial={initial}
          me={me}
          composer={{ me }}
          suggestions={{ people: sidebar.people, groups: suggestedGroups.filter((g) => !g.myRole) }}
          emptyTitle={EMPTY[tab.key].title}
          emptyBody={EMPTY[tab.key].body}
        />
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto [scrollbar-width:thin]">
          <CommunitySidebar {...sidebar} helpers={helpers} />
        </div>
      </div>
    </div>
  );
}
