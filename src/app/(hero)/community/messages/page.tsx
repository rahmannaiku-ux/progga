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
        <ul className="comic-panel bg-surface p-1.5 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/community/messages/${c.id}`}
                className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Avatar fallbackClassName="bg-primary/15 text-lg text-primary" src={c.other.avatarUrl} name={c.other.name} size={56} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[15px] text-foreground", c.unread ? "font-extrabold" : "font-semibold")}>{c.other.name}</p>
                  {c.lastMessage && (
                    <p className={cn("flex min-w-0 gap-1 text-[13px]", c.unread ? "font-bold text-foreground" : "text-muted-foreground")}>
                      <span className="truncate">
                        {c.lastMessage.fromMe ? "You: " : ""}
                        {c.lastMessage.body}
                      </span>
                      <span className="shrink-0">· {communityTimeAgo(new Date(c.lastMessage.createdAt))}</span>
                    </p>
                  )}
                </div>
                {c.unread > 0 && (
                  <span className="flex h-3 w-3 shrink-0 rounded-full bg-primary" aria-label={`${c.unread} unread`} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
