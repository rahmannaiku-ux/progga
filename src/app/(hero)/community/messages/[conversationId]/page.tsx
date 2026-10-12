import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Avatar } from "@/components/shared/avatar";
import { MessageThread } from "@/components/community/forms";
import { getConversation } from "@/server/services/community";

export const metadata = { title: "Conversation · Community" };

/** One conversation. Someone who is not one of its two people gets a 404. */
export default async function ConversationPage({ params }: { params: { conversationId: string } }) {
  const user = await getCurrentUser();
  const conversation = await getConversation(user.id, params.conversationId);
  if (!conversation) notFound();

  return (
    <div className="comic-panel mx-auto flex h-[calc(100dvh-22rem)] min-h-[20rem] max-w-2xl flex-col overflow-hidden bg-surface lg:h-[calc(100dvh-9rem)]">
      <header className="flex items-center gap-3 border-b border-border/20 p-3">
        <Link
          href="/community/messages"
          aria-label="Back to messages"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <Avatar fallbackClassName="bg-primary/15 text-primary" src={conversation.other.avatarUrl} name={conversation.other.name} size={40} />
        <div className="min-w-0">
          <Link href={`/community/u/${conversation.other.id}`} className="block truncate text-sm font-bold text-foreground hover:underline">
            {conversation.other.name}
          </Link>
          {conversation.other.headline && <p className="truncate text-xs text-muted-foreground">{conversation.other.headline}</p>}
        </div>
      </header>
      <MessageThread conversationId={conversation.id} initial={conversation.messages} initialHasMore={conversation.hasMore} />
    </div>
  );
}
