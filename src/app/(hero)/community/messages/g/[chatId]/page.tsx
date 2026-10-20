import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ChatThread } from "@/components/community/chat";
import { getGroupChat } from "@/server/services/chats";

export const metadata = { title: "Group chat · Community" };

/** One group chat. Someone who is not a member gets a 404. */
export default async function GroupChatPage(props: { params: Promise<{ chatId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  const chat = await getGroupChat(user.id, params.chatId);
  if (!chat) notFound();

  return (
    <ChatThread
      key={chat.id}
      kind="group"
      id={chat.id}
      meId={user.id}
      name={chat.name}
      myRole={chat.myRole}
      members={chat.members}
      initial={chat.messages}
      initialHasMore={chat.hasMore}
    />
  );
}
