import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/utils";
import { communityTimeAgo } from "@/lib/community/rules";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { listConversations } from "@/server/services/community";

export const metadata = { title: "Messages · Community" };

/** The viewer's own conversations, newest first. */
export default async function MessagesPage() {
  const user = await getCurrentUser();
  const conversations = await listConversations(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private between you and one other person. You can message heroes who follow you, and any mentor.
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          body="Open someone's profile and press Message to start one."
          action={{ href: "/community/discover", label: "Find heroes" }}
        />
      ) : (
        <ul className="comic-panel divide-y divide-border/20 bg-surface">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/community/messages/${c.id}`}
                className="flex items-center gap-3 p-3 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Avatar fallbackClassName="bg-primary/15 text-primary" src={c.other.avatarUrl} name={c.other.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm text-foreground", c.unread ? "font-extrabold" : "font-semibold")}>{c.other.name}</p>
                  {c.lastMessage && (
                    <p className={cn("truncate text-xs", c.unread ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {c.lastMessage.fromMe ? "You: " : ""}
                      {c.lastMessage.body}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.lastMessage && (
                    <time dateTime={c.lastMessage.createdAt} className="text-[11px] text-muted-foreground">
                      {communityTimeAgo(new Date(c.lastMessage.createdAt))}
                    </time>
                  )}
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                      {c.unread > 9 ? "9+" : c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
