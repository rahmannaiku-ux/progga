import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Lock, ShieldCheck, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canManageGroup,
  canModerateGroup,
  canRemoveFromGroup,
  canSeeGroupContent,
  canSetGroupRole,
  communityTimeAgo,
  displayName,
  isCommunityStaff,
} from "@/lib/community/rules";
import { Avatar } from "@/components/shared/avatar";
import { JoinGroupButton } from "@/components/community/bits";
import { Feed } from "@/components/community/feed";
import { DeleteGroupButton, GroupForm, GroupMemberActions, JoinRequestButtons } from "@/components/community/forms";
import { getFeedPage, getGroup, listGroupMembers, listJoinRequests } from "@/server/services/community";

const ROLE_LABEL = { OWNER: "Owner", ADMIN: "Admin", MODERATOR: "Moderator", MEMBER: "Member" } as const;
const ROLE_CHOICES = ["ADMIN", "MODERATOR", "MEMBER"] as const;

/**
 * One study group: its feed, its members, and (for the people who run it)
 * join requests and settings. A private group shows outsiders only its
 * name, description and size until they are let in.
 */
export default async function GroupPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  const group = await getGroup(user, params.slug);
  if (!group) notFound();

  const canSee = canSeeGroupContent({ viewerRole: user.role, privacy: group.privacy, membership: group.myRole });
  const canManage = canManageGroup({ viewerRole: user.role, membership: group.myRole });
  const canModerate = canModerateGroup({ viewerRole: user.role, membership: group.myRole });
  const [initial, members, requests] = await Promise.all([
    canSee ? getFeedPage(user, { type: "group", groupId: group.id }) : null,
    canSee ? listGroupMembers(group.id) : [],
    canModerate && group.privacy === "PRIVATE" ? listJoinRequests(group.id) : [],
  ]);
  const me = { name: displayName(user), avatarUrl: user.avatarUrl };

  return (
    <div className="gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <Link href="/community/groups" className="text-xs font-bold text-muted-foreground hover:text-foreground">
          ← All groups
        </Link>
        <header className="comic-panel overflow-hidden bg-surface">
          {/* The group's cover, Facebook style: a banner, then name, privacy, size and faces of members. */}
          <div className="halftone-dots relative flex h-28 items-end bg-gradient-to-br from-primary to-accent px-4 pb-3 sm:h-40 sm:px-5">
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">{group.topic}</span>
          </div>
          <div className="p-4 sm:p-5">
            <h1 className="break-words font-display text-2xl font-extrabold text-foreground sm:text-3xl">{group.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {group.privacy === "PRIVATE" ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
              {group.privacy === "PRIVATE" ? "Private group" : "Public group"} ·{" "}
              <span className="font-bold text-foreground">{group.memberCount}</span> member{group.memberCount === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <ul className="flex" aria-label="Some of the members">
                {members.slice(0, 8).map((m, i) => (
                  <li key={m.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0" style={{ zIndex: 8 - i }}>
                    <Avatar fallbackClassName="bg-primary/15 text-primary" src={m.avatarUrl} name={m.name} size={32} />
                  </li>
                ))}
              </ul>
              <JoinGroupButton
                groupId={group.id}
                initialJoined={Boolean(group.myRole)}
                isOwner={group.myRole === "OWNER"}
                privacy={group.privacy}
                initialRequested={group.requested}
              />
            </div>
            <p className="mt-4 whitespace-pre-line border-t border-border/15 pt-3 text-sm text-foreground">{group.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Created by {group.owner.name}</p>
          </div>
        </header>

        {!canSee ? (
          <div className="comic-panel flex flex-col items-center gap-2 bg-surface p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-display text-lg font-bold text-foreground">This group is private</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {group.requested
                ? "Your request to join is waiting for the group's admins or moderators."
                : "Only members can see who's in it and what they post. Ask to join and an admin or moderator will let you in."}
            </p>
          </div>
        ) : (
          <>
            {!group.myRole && <p className="comic-panel bg-surface p-3 text-sm text-muted-foreground">Join this group to post in it.</p>}
            <Feed
              key={`${group.id}:${group.myRole ?? "guest"}`}
              scope={{ type: "group", groupId: group.id }}
              initial={initial ?? { posts: [], nextCursor: null }}
              me={me}
              composer={group.myRole ? { me, groupId: group.id, groupName: group.name } : undefined}
              emptyTitle="No posts in this group yet"
              emptyBody={group.myRole ? "Start the first discussion." : "Join to start the first discussion."}
            />
          </>
        )}
      </div>

      <aside className="mt-6 space-y-4 xl:mt-0">
        {canModerate && group.privacy === "PRIVATE" && (
          <section className="comic-panel bg-surface p-4" aria-labelledby="join-requests">
            <h2 id="join-requests" className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
              Join requests
              {requests.length > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{requests.length}</span>}
            </h2>
            {requests.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No one is waiting.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5">
                    <Avatar fallbackClassName="bg-primary/15 text-primary" src={r.avatarUrl} name={r.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/community/u/${r.id}`} prefetch={false} className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">Asked {communityTimeAgo(new Date(r.requestedAt))} ago</p>
                    </div>
                    <JoinRequestButtons groupId={group.id} userId={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canSee && (
          <section className="comic-panel bg-surface p-4" aria-labelledby="group-members">
            <h2 id="group-members" className="font-display text-sm font-bold text-foreground">
              Members ({group.memberCount})
            </h2>
            <ul className="mt-3 space-y-2.5">
              {members.map((m) => {
                const target = m.role;
                const roles =
                  target === "OWNER" || m.id === user.id
                    ? []
                    : ROLE_CHOICES.filter((to) => to === target || canSetGroupRole({ viewerRole: user.role, actor: group.myRole, target, to }));
                const removable = m.id !== user.id && canRemoveFromGroup({ viewerRole: user.role, actor: group.myRole, target });
                return (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar fallbackClassName="bg-primary/15 text-primary" src={m.avatarUrl} name={m.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/community/u/${m.id}`} prefetch={false} className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {m.name}
                      </Link>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {m.role !== "MEMBER" && <ShieldCheck className="h-3 w-3 text-accent" aria-hidden="true" />}
                        {ROLE_LABEL[m.role]}
                      </p>
                    </div>
                    {target !== "OWNER" && (
                      <GroupMemberActions groupId={group.id} userId={m.id} name={m.name} role={target} roles={roles} canRemove={removable} />
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              The owner chooses admins. Admins change the group and choose moderators. Admins and moderators remove posts and
              comments{group.privacy === "PRIVATE" ? " and approve who joins" : ""}.
            </p>
          </section>
        )}

        {canManage && (
          <details className="comic-panel bg-surface p-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-display text-sm font-bold text-foreground">
              <Users className="h-4 w-4" aria-hidden="true" /> Group settings
            </summary>
            <div className="mt-4 space-y-4">
              <GroupForm group={{ id: group.id, name: group.name, topic: group.topic, description: group.description, privacy: group.privacy }} />
              {(group.myRole === "OWNER" || isCommunityStaff(user.role)) && <DeleteGroupButton groupId={group.id} />}
            </div>
          </details>
        )}
      </aside>
    </div>
  );
}
