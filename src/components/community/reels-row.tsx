import Link from "next/link";
import { Clapperboard, Play, Plus } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import type { PostDTO } from "@/server/services/community";

function views(n: number) {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/**
 * The "Reels" row at the top of the feed: a "Create reel" card, then the
 * newest reels as tall cards that open the full-screen player.
 */
export function ReelsRow({ reels, me }: { reels: PostDTO[]; me: { name: string; avatarUrl: string | null } }) {
  return (
    <section className="comic-panel bg-surface py-3 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0" aria-label="Reels">
      <div className="flex items-center justify-between px-3 sm:px-4">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <Clapperboard className="h-5 w-5 text-danger" aria-hidden="true" /> Reels
        </h2>
        {reels.length > 0 && (
          <Link href="/community/reels" className="text-sm font-semibold text-primary hover:underline">
            Watch all
          </Link>
        )}
      </div>
      <ul className="mt-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
        <li className="w-28 shrink-0 snap-start">
          <Link
            href="/community/reels?create=1"
            className="flex aspect-[9/16] flex-col overflow-hidden rounded-xl border border-border/25 bg-muted transition-transform active:scale-[0.98]"
          >
            <span className="relative flex flex-1 items-center justify-center">
              <Avatar fallbackClassName="bg-primary/15 text-2xl text-primary" src={me.avatarUrl} name={me.name} size={56} />
            </span>
            <span className="relative flex flex-col items-center bg-surface pb-2 pt-5">
              <span className="absolute -top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-surface">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-bold text-foreground">Create reel</span>
            </span>
          </Link>
        </li>
        {reels.map((r) => (
          <li key={r.id} className="w-28 shrink-0 snap-start">
            <Link
              href={`/community/reels?r=${r.id}`}
              prefetch={false}
              className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-gradient-to-br from-primary to-accent transition-transform active:scale-[0.98]"
            >
              {r.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- the reel's cover frame, from /api/files
                <img src={r.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
              <span className="absolute left-2 top-2 rounded-full ring-2 ring-primary">
                <Avatar fallbackClassName="bg-primary text-primary-foreground" src={r.author.avatarUrl} name={r.author.name} size={30} />
              </span>
              <span className="absolute inset-x-2 bottom-2 text-white">
                <span className="line-clamp-2 text-xs font-bold leading-tight drop-shadow">{r.content || r.author.name}</span>
                <span className="mt-0.5 flex items-center gap-0.5 text-[11px] font-semibold text-white/85">
                  <Play className="h-3 w-3 fill-white" aria-hidden="true" /> {views(r.video?.views ?? 0)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
