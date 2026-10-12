import { getCurrentUser } from "@/lib/auth/current-user";
import { Feed } from "@/components/community/feed";
import { getFeedPage } from "@/server/services/community";

export const metadata = { title: "Saved · Community" };

/** Posts the viewer saved. Only they can see this list. */
export default async function SavedPage() {
  const user = await getCurrentUser();
  const initial = await getFeedPage(user, { type: "saved" });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Saved posts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only you can see what you save.</p>
      </div>
      <Feed
        scope={{ type: "saved" }}
        initial={initial}
        emptyTitle="Nothing saved yet"
        emptyBody="Open a post's menu and choose Save post to keep it here."
      />
    </div>
  );
}
