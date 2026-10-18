import { getCurrentUser } from "@/lib/auth/current-user";
import { displayName } from "@/lib/community/rules";
import { CommunityNav } from "@/components/community/community-nav";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { countUnreadConversations } from "@/server/services/community";

/** Shell for every Community screen: its own navigation beside the page. */
export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [unreadMessages, open] = await Promise.all([
    countUnreadConversations(user.id),
    isFeatureEnabled("community", { userId: user.id, role: user.role }),
  ]);

  return (
    <div className="mx-auto max-w-6xl gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <CommunityNav me={{ id: user.id, name: displayName(user), avatarUrl: user.avatarUrl }} unreadMessages={unreadMessages} />
      <div className="mt-3 min-w-0 lg:mt-0">
        {!open && (
          <p role="status" className="comic-panel mb-4 bg-surface p-3 text-sm font-semibold text-foreground">
            The Community is paused for a moment: you can read, but posting is switched off.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
