import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, Lock, Zap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/community/rules";
import { formatDhakaDate } from "@/lib/timezone";
import { Avatar } from "@/components/shared/avatar";
import { AchievementIcon } from "@/components/gamification/achievement-icon";
import { FollowButton, MessageButton } from "@/components/community/bits";
import { Feed } from "@/components/community/feed";
import { ProfileForm } from "@/components/community/forms";
import { ProfileReport } from "@/components/community/profile-report";
import { getConnections, getFeedPage, getProfile } from "@/server/services/community";

/**
 * A person's community profile. Shows only what is meant to be public:
 * name, picture, headline, bio, level, streak, badges and their posts.
 * Never phone, email, grades or enrolments.
 */
export default async function CommunityProfilePage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { show?: string };
}) {
  const user = await getCurrentUser();
  const profile = await getProfile(user, params.userId);
  if (!profile) notFound();

  const show = searchParams.show === "followers" || searchParams.show === "following" ? searchParams.show : "posts";
  const [initial, connections] = await Promise.all([
    show === "posts" && profile.canSeePosts ? getFeedPage(user, { type: "profile", userId: profile.id }) : null,
    show !== "posts" && profile.canSeePosts ? getConnections(user, profile.id, show) : null,
  ]);

  const tabs = [
    { key: "posts", label: `Posts`, count: profile.postCount },
    { key: "followers", label: "Followers", count: profile.followerCount },
    { key: "following", label: "Following", count: profile.followingCount },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="comic-panel overflow-hidden bg-surface">
        <div className="halftone-dots h-20 bg-primary" aria-hidden="true" />
        <div className="px-4 pb-4 sm:px-5">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
            <span className="rounded-full border-4 border-surface bg-surface">
              <Avatar fallbackClassName="bg-primary/15 text-3xl text-primary" src={profile.avatarUrl} name={profile.name} size={84} />
            </span>
            <div className="flex flex-wrap gap-2">
              {profile.isSelf ? (
                <Link href="/profile" className="comic-btn flex h-11 items-center border border-border/60 bg-surface px-4 text-sm font-bold text-foreground">
                  Change picture
                </Link>
              ) : (
                <>
                  <MessageButton userId={profile.id} />
                  <FollowButton userId={profile.id} initialFollowing={profile.isFollowing} />
                </>
              )}
            </div>
          </div>

          <h1 className="mt-3 flex flex-wrap items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            {profile.name}
            {profile.isMentor && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">Mentor</span>}
            {profile.isPrivate && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" /> Private
              </span>
            )}
          </h1>
          {profile.headline && <p className="text-sm font-semibold text-muted-foreground">{profile.headline}</p>}
          {profile.followsViewer && !profile.isSelf && <p className="mt-1 text-xs font-bold text-accent">Follows you</p>}
          {profile.bio && <p className="mt-3 whitespace-pre-line break-words text-sm text-foreground">{profile.bio}</p>}

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-bold text-foreground">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Level {profile.level}
            </span>
            {profile.streak > 0 && (
              <span className="flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {profile.streak}-day streak
              </span>
            )}
            <span>Joined {formatDhakaDate(profile.joinedAt)}</span>
          </p>

          {profile.achievements.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Badges">
              {profile.achievements.map((a) => (
                <li key={a.key} title={a.name} className="flex items-center gap-1.5 rounded-full bg-xp/20 px-2.5 py-1 text-xs font-bold text-foreground">
                  <AchievementIcon iconKey={a.iconKey} className="h-3.5 w-3.5" /> {a.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {profile.isSelf && (
        <details className="comic-panel bg-surface p-4">
          <summary className="cursor-pointer list-none font-display text-sm font-bold text-accent">Edit your community profile</summary>
          <div className="mt-4">
            <ProfileForm initial={{ bio: profile.bio ?? "", headline: profile.headline ?? "", communityPrivate: profile.isPrivate }} />
          </div>
        </details>
      )}

      <div role="tablist" aria-label="Profile sections" className="flex gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "posts" ? `/community/u/${profile.id}` : `/community/u/${profile.id}?show=${t.key}`}
            role="tab"
            aria-selected={show === t.key}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold",
              show === t.key ? "bg-xp text-xp-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label} <span className="font-mono text-xs">{t.count}</span>
          </Link>
        ))}
      </div>

      {!profile.canSeePosts ? (
        <div className="comic-panel flex items-center gap-3 bg-surface p-5">
          <Lock className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            This profile is private. Follow {profile.name.split(" ")[0]} to see their posts.
          </p>
        </div>
      ) : initial ? (
        <Feed
          key={profile.id}
          scope={{ type: "profile", userId: profile.id }}
          initial={initial}
          composer={profile.isSelf ? { me: { name: displayName(user), avatarUrl: user.avatarUrl } } : undefined}
          emptyTitle={profile.isSelf ? "You haven't posted yet" : "No posts yet"}
          emptyBody={profile.isSelf ? "Share something with the community." : `${profile.name} hasn't posted anything yet.`}
        />
      ) : (
        <ul className="space-y-2">
          {(connections ?? []).map((p) => (
            <li key={p.id} className="comic-panel flex items-center gap-3 bg-surface p-3">
              <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/community/u/${p.id}`} prefetch={false} className="block truncate text-sm font-bold text-foreground hover:underline">
                  {p.name}
                </Link>
                {p.headline && <p className="truncate text-xs text-muted-foreground">{p.headline}</p>}
              </div>
              {p.id !== user.id && <FollowButton userId={p.id} initialFollowing={p.isFollowing} size="sm" />}
            </li>
          ))}
          {(connections ?? []).length === 0 && <li className="text-sm text-muted-foreground">No one here yet.</li>}
        </ul>
      )}

      {!profile.isSelf && <ProfileReport userId={profile.id} />}
    </div>
  );
}
