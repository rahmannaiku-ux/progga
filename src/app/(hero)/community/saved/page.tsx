import { Bookmark } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { displayName } from "@/lib/community/rules";
import { Feed } from "@/components/community/feed";
import { getFeedPage } from "@/server/services/community";

export const metadata = { title: "Saved · Community" };

/** Posts the viewer saved. Only they can see this list. */
export default async function SavedPage() {
  const user = await getCurrentUser();
  const initial = await getFeedPage(user, { type: "saved" });
  return (
    <div className="mx-auto max-w-[680px] space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-xp/25 text-foreground">
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Saved</h1>
          <p className="text-sm text-muted-foreground">Only you can see what you save.</p>
        </div>
      </div>
      <Feed
        scope={{ type: "saved" }}
        initial={initial}
        me={{ name: displayName(user), avatarUrl: user.avatarUrl }}
        emptyTitle="Nothing saved yet"
        emptyBody="Open a post's menu and choose Save post to keep it here."
      />
    </div>
  );
}
