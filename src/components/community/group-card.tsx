import Link from "next/link";
import { Users } from "lucide-react";
import { JoinGroupButton } from "@/components/community/bits";
import type { GroupDTO } from "@/server/services/community";

export function GroupCard({ group }: { group: GroupDTO }) {
  return (
    <div className="comic-panel flex flex-col gap-3 bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <Link href={`/community/groups/${group.slug}`} prefetch={false} className="block truncate font-display text-base font-extrabold text-foreground hover:underline">
            {group.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {group.topic} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {group.postCount} post{group.postCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
      <div className="mt-auto flex justify-end">
        <JoinGroupButton groupId={group.id} initialJoined={Boolean(group.myRole)} isOwner={group.myRole === "OWNER"} size="sm" />
      </div>
    </div>
  );
}
