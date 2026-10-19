import { MessageCircle } from "lucide-react";

export const metadata = { title: "Chats · Community" };

/** Wide screens: the empty right-hand pane until a chat is picked (phones show the list instead). */
export default function MessagesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MessageCircle className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="font-display text-lg font-bold text-foreground">Your chats</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Pick a chat on the left, or start a group with New group. You can message heroes who follow you, and any mentor.
      </p>
    </div>
  );
}
