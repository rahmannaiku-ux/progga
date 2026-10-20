import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { displayName } from "@/lib/community/rules";
import { ReelsViewer } from "@/components/community/reels-viewer";
import { getFeedPage, getPost, type FeedScope } from "@/server/services/community";

export const metadata = { title: "Reels · Community" };

/**
 * Proggaa Reels. `?r=<id>` opens at that reel (a shared link), `?u=<userId>`
 * shows one person's reels, `?create=1` opens "Create reel" straight away.
 */
export default async function ReelsPage(
  props: { searchParams: Promise<{ r?: string; u?: string; create?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const userId = searchParams.u?.slice(0, 40);
  const scope: FeedScope = userId ? { type: "reels", userId } : { type: "reels" };

  const [page, first, canCreate] = await Promise.all([
    getFeedPage(user, scope),
    searchParams.r ? getPost(user, searchParams.r.slice(0, 40)) : null,
    isFeatureEnabled("reel_posting", { userId: user.id, role: user.role }),
  ]);
  const start = first?.kind === "REEL" && (!userId || first.author.id === userId) ? first : null;
  const reels = start ? [start, ...page.posts.filter((p) => p.id !== start.id)] : page.posts;

  return (
    <ReelsViewer
      key={userId ?? "all"}
      scope={scope}
      initial={reels}
      initialCursor={page.nextCursor}
      me={{ name: displayName(user), avatarUrl: user.avatarUrl }}
      canCreate={canCreate}
      openCreate={canCreate && searchParams.create === "1"}
    />
  );
}
