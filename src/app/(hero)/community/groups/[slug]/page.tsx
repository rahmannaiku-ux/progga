import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageGroup, displayName } from "@/lib/community/rules";
import { Avatar } from "@/components/shared/avatar";
import { JoinGroupButton } from "@/components/community/bits";
import { Feed } from "@/components/community/feed";
import { DeleteGroupButton, GroupForm, ModeratorToggle } from "@/components/community/forms";
import { getFeedPage, getGroup, listGroupMembers } from "@/server/services/community";

const ROLE_LABEL = { OWNER: "Owner", MODERATOR: "Moderator", MEMBER: "Member" } as const;

/** One study group: its feed, its members, and (for the owner) its settings. */
export default async function GroupPage({ params }: { params: { slug: string } }) {
  const user = await getCurrentUser();
  const group = await getGroup(user, params.slug);
  if (!group) notFound();

  const [initial, members] = await Promise.all([
    getFeedPage(user, { type: "group", groupId: group.id }),
    listGroupMembers(group.id),
  ]);
  const canManage = canManageGroup({ viewerRole: user.role, membership: group.myRole });

  return (
    <div className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <Link href="/community/groups" className="text-xs font-bold text-muted-foreground hover:text-foreground">
          ← All groups
        </Link>
        <header className="comic-panel overflow-hidden bg-surface">
          {/* The group's cover, Facebook style: a banner, then name, size and faces of members. */}
          <div className="halftone-dots relative flex h-28 items-end bg-gradient-to-br from-primary to-accent px-4 pb-3 sm:h-40 sm:px-5">
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">{group.topic}</span>
          </div>
          <div className="p-4 sm:p-5">
            <h1 className="break-words font-display text-2xl font-extrabold text-foreground sm:text-3xl">{group.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" /> Study group · <span className="font-bold text-foreground">{group.memberCount}</span> member
              {group.memberCount === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <ul className="flex" aria-label="Some of the members">
                {members.slice(0, 8).map((m, i) => (
                  <li key={m.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0" style={{ zIndex: 8 - i }}>
                    <Avatar fallbackClassName="bg-primary/15 text-primary" src={m.avatarUrl} name={m.name} size={32} />
                  </li>
                ))}
              </ul>
              <JoinGroupButton groupId={group.id} initialJoined={Boolean(group.myRole)} isOwner={group.myRole === "OWNER"} />
            </div>
            <p className="mt-4 whitespace-pre-line border-t border-border/15 pt-3 text-sm text-foreground">{group.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Run by {group.owner.name}</p>
          </div>
        </header>

        {!group.myRole && (
          <p className="comic-panel bg-surface p-3 text-sm text-muted-foreground">Join this group to post in it.</p>
        )}

        <Feed
          key={`${group.id}:${group.myRole ?? "guest"}`}
          scope={{ type: "group", groupId: group.id }}
          initial={initial}
          me={{ name: displayName(user), avatarUrl: user.avatarUrl }}
          composer={
            group.myRole
              ? { me: { name: displayName(user), avatarUrl: user.avatarUrl }, groupId: group.id, groupName: group.name }
              : undefined
          }
          emptyTitle="No posts in this group yet"
          emptyBody={group.myRole ? "Start the first discussion." : "Join to start the first discussion."}
        />
      </div>

      <aside className="mt-6 space-y-4 xl:mt-0">
        <section className="comic-panel bg-surface p-4" aria-labelledby="group-members">
          <h2 id="group-members" className="font-display text-sm font-bold text-foreground">
            Members ({group.memberCount})
          </h2>
          <ul className="mt-3 space-y-2.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar fallbackClassName="bg-primary/15 text-primary" src={m.avatarUrl} name={m.name} size={30} />
                <div className="min-w-0 flex-1">
                  <Link href={`/community/u/${m.id}`} prefetch={false} className="block truncate text-sm font-semibold text-foreground hover:underline">
                    {m.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[m.role]}</p>
                </div>
                {canManage && m.role !== "OWNER" && (
                  <ModeratorToggle groupId={group.id} userId={m.id} isModerator={m.role === "MODERATOR"} />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            The owner chooses moderators. Owners and moderators can remove posts and comments in this group.
          </p>
        </section>

        {canManage && (
          <details className="comic-panel bg-surface p-4">
            <summary className="cursor-pointer list-none font-display text-sm font-bold text-foreground">Group settings</summary>
            <div className="mt-4 space-y-4">
              <GroupForm group={{ id: group.id, name: group.name, topic: group.topic, description: group.description }} />
              <DeleteGroupButton groupId={group.id} />
            </div>
          </details>
        )}
      </aside>
    </div>
  );
}
