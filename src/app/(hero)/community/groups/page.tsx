import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/utils";
import { GroupCard } from "@/components/community/group-card";
import { GroupForm } from "@/components/community/forms";
import { listGroupTopics, listGroups } from "@/server/services/community";

export const metadata = { title: "Groups · Community" };

/** Study groups: yours, all of them by topic, and a form to start one. */
export default async function GroupsPage(props: { searchParams: Promise<{ topic?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const topic = (searchParams.topic ?? "").slice(0, 40) || null;
  const [mine, all, topics] = await Promise.all([
    listGroups(user, { mine: true, take: 12 }),
    listGroups(user, { topic, take: 40 }),
    listGroupTopics(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Study groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">Join a group to post in it and see its discussions in your Following feed.</p>
      </div>

      <details className="comic-panel bg-surface p-4">
        <summary className="cursor-pointer list-none font-display text-sm font-bold text-accent">+ Start a new group</summary>
        <div className="mt-4">
          <GroupForm />
        </div>
      </details>

      {mine.length > 0 && !topic && (
        <section aria-labelledby="my-groups">
          <h2 id="my-groups" className="font-display text-lg font-extrabold text-foreground">
            Your groups
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {mine.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-groups">
        <h2 id="all-groups" className="font-display text-lg font-extrabold text-foreground">
          {topic ? `Groups about ${topic}` : "All groups"}
        </h2>
        {topics.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[null, ...topics].map((t) => (
              <Link
                key={t ?? "all"}
                href={t ? `/community/groups?topic=${encodeURIComponent(t)}` : "/community/groups"}
                aria-current={(t ?? null) === topic ? "true" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-bold",
                  (t ?? null) === topic ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
                )}
              >
                {t ?? "All topics"}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {all.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
        {all.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No groups here yet. Start one above.</p>}
      </section>
    </div>
  );
}
