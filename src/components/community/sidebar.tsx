import Link from "next/link";
import { Award, Flame, Users } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { FollowButton } from "@/components/community/bits";
import type { GroupDTO, HelperDTO, PersonCardDTO, TrendingItem } from "@/server/services/community";

/** The right-hand column of the feed: what is busy, who helps, who to follow. */
export function CommunitySidebar({
  groups,
  trending,
  people,
  helpers,
}: {
  groups: GroupDTO[];
  trending: TrendingItem[];
  people: PersonCardDTO[];
  helpers: HelperDTO[];
}) {
  return (
    <aside className="space-y-4" aria-label="Around the community">
      {trending.length > 0 && (
        <section className="comic-panel bg-surface p-4">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <Flame className="h-4 w-4 text-danger" aria-hidden="true" /> Trending now
          </h2>
          <ul className="mt-3 space-y-3">
            {trending.map((t) => (
              <li key={t.id}>
                <Link href={`/community/post/${t.id}`} prefetch={false} className="block text-sm font-semibold text-foreground hover:underline">
                  {t.excerpt}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.reactions} reaction{t.reactions === 1 ? "" : "s"} · {t.comments} {t.kind === "QUESTION" ? "answer" : "comment"}
                  {t.comments === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {helpers.length > 0 && (
        <section className="comic-panel bg-surface p-4">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <Award className="h-4 w-4 text-accent" aria-hidden="true" /> Helpful heroes
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Answers marked useful in the last 30 days.</p>
          <ol className="mt-3 space-y-2.5">
            {helpers.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2.5">
                <span className="w-4 font-mono text-xs font-bold text-muted-foreground">{i + 1}</span>
                <Avatar fallbackClassName="bg-primary/15 text-primary" src={h.avatarUrl} name={h.name} size={28} />
                <Link href={`/community/u/${h.id}`} prefetch={false} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:underline">
                  {h.name}
                </Link>
                <span className="shrink-0 font-mono text-xs font-bold text-foreground">{h.usefulAnswers}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {groups.length > 0 && (
        <section className="comic-panel bg-surface p-4">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Study groups
          </h2>
          <ul className="mt-3 space-y-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/community/groups/${g.slug}`} prefetch={false} className="block text-sm font-semibold text-foreground hover:underline">
                  {g.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {g.topic} · {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
          <Link href="/community/groups" className="mt-3 inline-block text-xs font-bold text-accent hover:underline">
            See all groups
          </Link>
        </section>
      )}

      {people.length > 0 && (
        <section className="comic-panel bg-surface p-4">
          <h2 className="font-display text-sm font-bold text-foreground">Heroes to follow</h2>
          <ul className="mt-3 space-y-3">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5">
                <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={32} />
                <Link href={`/community/u/${p.id}`} prefetch={false} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:underline">
                  {p.name}
                </Link>
                <FollowButton userId={p.id} initialFollowing={p.isFollowing} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
