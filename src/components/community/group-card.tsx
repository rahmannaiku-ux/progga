import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { JoinGroupButton } from "@/components/community/bits";
import type { GroupDTO } from "@/server/services/community";

/** A study group as a card: cover strip, name, size, and Join. */
export function GroupCard({ group }: { group: GroupDTO }) {
  return (
    <div className="comic-panel flex flex-col overflow-hidden bg-surface">
      <Link
        href={`/community/groups/${group.slug}`}
        prefetch={false}
        aria-hidden="true"
        tabIndex={-1}
        className="halftone-dots flex h-20 items-end bg-gradient-to-br from-primary to-accent px-3 pb-2"
      >
        <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">{group.topic}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <Link href={`/community/groups/${group.slug}`} prefetch={false} className="block truncate font-display text-base font-extrabold text-foreground hover:underline">
            {group.name}
          </Link>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {group.privacy === "PRIVATE" ? (
              <Lock className="h-3.5 w-3.5" aria-label="Private group" />
            ) : (
              <Globe className="h-3.5 w-3.5" aria-label="Public group" />
            )}
            {group.privacy === "PRIVATE" ? "Private" : "Public"} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {group.postCount} post{group.postCount === 1 ? "" : "s"}
          </p>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
        <div className="mt-auto pt-1 [&>span]:flex [&_button]:w-full">
          <JoinGroupButton
            groupId={group.id}
            initialJoined={Boolean(group.myRole)}
            isOwner={group.myRole === "OWNER"}
            privacy={group.privacy}
            initialRequested={group.requested}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
