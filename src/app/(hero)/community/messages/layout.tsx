import { getCurrentUser } from "@/lib/auth/current-user";
import { ChatList } from "@/components/community/chat";
import { listChats } from "@/server/services/chats";
import { MessagesPane } from "./messages-pane";

/**
 * Messenger-style Chats: the list of chats beside the open one on wide
 * screens; on phones the list and a chat each take the whole screen.
 */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const chats = await listChats(user.id);

  return (
    <MessagesPane list={<ChatList initial={chats} className="h-full" />}>{children}</MessagesPane>
  );
}
