import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ChatThread } from "@/components/community/chat";
import { getConversation } from "@/server/services/community";

export const metadata = { title: "Chat · Community" };

/** One direct conversation. Someone who is not one of its two people gets a 404. */
export default async function ConversationPage(props: { params: Promise<{ conversationId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  const conversation = await getConversation(user.id, params.conversationId);
  if (!conversation) notFound();

  return (
    <ChatThread
      key={conversation.id}
      kind="direct"
      id={conversation.id}
      other={conversation.other}
      initial={conversation.messages}
      initialHasMore={conversation.hasMore}
      initialOtherReadAt={conversation.otherReadAt}
      initialMutedUntil={conversation.mutedUntil}
    />
  );
}
