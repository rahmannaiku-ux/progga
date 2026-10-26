import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, CalendarDays, Camera, Clapperboard, Flame, Lock, Pencil, Play, Zap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/community/rules";
import { formatDhakaDate } from "@/lib/timezone";
import { Avatar } from "@/components/shared/avatar";
import { AchievementIcon } from "@/components/gamification/achievement-icon";
import { FollowButton, MessageButton } from "@/components/community/bits";
import { Feed } from "@/components/community/feed";
import { ProfileForm, UsernameForm } from "@/components/community/forms";
import { ProfileReport } from "@/components/community/profile-report";
import { getConnections, getFeedPage, getProfile } from "@/server/services/community";

/**
 * A person's community profile, laid out like a Facebook profile: cover,
 * big picture, name and follower counts, then an Intro card beside their
 * posts. Shows only what is meant to be public: name, picture, headline,
 * bio, level, streak, badges and their posts. Never phone, email, grades
 * or enrolments.
 */
export default async function CommunityProfilePage(
  props: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ show?: string; edit?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  const profile = await getProfile(user, params.userId);
  if (!profile) notFound();

  const show =
    searchParams.show === "followers" || searchParams.show === "following" || searchParams.show === "reels" ? searchParams.show : "posts";
  const [initial, connections, reels, canPostReels] = await Promise.all([
    show === "posts" && profile.canSeePosts ? getFeedPage(user, { type: "profile", userId: profile.id }) : null,
    (show === "followers" || show === "following") && profile.canSeePosts ? getConnections(user, profile.id, show) : null,
    show === "reels" && profile.canSeePosts ? getFeedPage(user, { type: "reels", userId: profile.id }) : null,
    isFeatureEnabled("reel_posting", { userId: user.id, role: user.role }),
  ]);
  const me = { name: displayName(user), avatarUrl: user.avatarUrl };
  const base = `/community/u/${profile.id}`;

  const tabs = [
    { key: "posts", label: "Posts", count: profile.postCount },
    { key: "reels", label: "Reels", count: profile.reelCount },
    { key: "followers", label: "Followers", count: profile.followerCount },
    { key: "following", label: "Following", count: profile.followingCount },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <header className="comic-panel overflow-hidden bg-surface max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0">
        <div className="halftone-dots h-32 bg-gradient-to-br from-primary via-primary to-accent sm:h-52" aria-hidden="true" />
        <div className="px-4 sm:px-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:gap-5">
            <span className="-mt-16 shrink-0 rounded-full bg-surface p-1 shadow-card sm:-mt-20">
              <Avatar fallbackClassName="bg-primary/15 text-5xl text-primary" src={profile.avatarUrl} name={profile.name} size={136} />
            </span>
            <div className="min-w-0 flex-1 pb-1 text-center sm:pb-4 sm:text-left">
              <h1 className="flex flex-wrap items-center justify-center gap-2 font-display text-2xl font-extrabold text-foreground sm:justify-start sm:text-3xl">
                {profile.name}
                {profile.isMentor && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">Mentor</span>}
                {profile.isPrivate && (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    <Lock className="h-3 w-3" aria-hidden="true" /> Private
                  </span>
                )}
              </h1>
              {profile.username && <p className="text-sm font-semibold text-muted-foreground">@{profile.username}</p>}
              <p className="mt-0.5 text-sm text-muted-foreground">
                <Link href={`${base}?show=followers`} className="tap-area hover:underline">
                  <span className="font-bold text-foreground">{profile.followerCount}</span> follower{profile.followerCount === 1 ? "" : "s"}
                </Link>
                {" · "}
                <Link href={`${base}?show=following`} className="tap-area hover:underline">
                  <span className="font-bold text-foreground">{profile.followingCount}</span> following
                </Link>
                {profile.followsViewer && !profile.isSelf && <span className="font-bold text-accent"> · Follows you</span>}
              </p>
            </div>
            <div className="flex w-full gap-2 pb-4 sm:w-auto [&>span]:flex-1 [&_button]:w-full">
              {profile.isSelf ? (
                <>
                  <a href={`${base}?edit=1#edit-profile`} className="comic-btn flex h-11 flex-1 items-center justify-center gap-1.5 bg-primary px-4 text-sm font-bold text-primary-foreground">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile
                  </a>
                  <Link href="/profile" className="comic-btn flex h-11 flex-1 items-center justify-center gap-1.5 border border-border/60 bg-muted px-4 text-sm font-bold text-foreground">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Picture
                  </Link>
                </>
              ) : (
                <>
                  <FollowButton userId={profile.id} initialFollowing={profile.isFollowing} />
                  <MessageButton userId={profile.id} />
                </>
              )}
            </div>
          </div>

          <nav aria-label="Profile sections" className="-mx-1 flex border-t border-border/15">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.key === "posts" ? base : `${base}?show=${t.key}`}
                aria-current={show === t.key ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-1.5 px-3 text-sm font-bold transition-colors",
                  show === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className="font-mono text-xs">{t.count}</span>
                {show === t.key && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-primary" />}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-3 lg:sticky lg:top-4">
          <section className="comic-panel bg-surface p-4" aria-labelledby="intro">
            <h2 id="intro" className="font-display text-lg font-extrabold text-foreground">
              Intro
            </h2>
            {profile.headline && <p className="mt-2 text-center text-sm font-semibold text-foreground">{profile.headline}</p>}
            {profile.bio && <p className="mt-2 whitespace-pre-line break-words text-center text-sm text-foreground">{profile.bio}</p>}
            {(profile.headline || profile.bio) && <hr className="my-3 border-border/15" />}
            <ul className="space-y-2.5 text-sm text-foreground">
              <li className="flex items-center gap-2.5">
                <Zap className="h-5 w-5 shrink-0 text-xp" aria-hidden="true" /> Level <span className="font-bold">{profile.level}</span>
                <span className="text-muted-foreground">· {profile.xp} XP</span>
              </li>
              {profile.streak > 0 && (
                <li className="flex items-center gap-2.5">
                  <Flame className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" /> <span className="font-bold">{profile.streak}-day</span> study streak
                </li>
              )}
              <li className="flex items-center gap-2.5">
                <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /> Joined {formatDhakaDate(profile.joinedAt)}
              </li>
            </ul>
            {profile.achievements.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Badges">
                {profile.achievements.map((a) => (
                  <li key={a.key} title={a.name} className="flex items-center gap-1.5 rounded-full bg-xp/20 px-2.5 py-1 text-xs font-bold text-foreground">
                    <AchievementIcon iconKey={a.iconKey} className="h-3.5 w-3.5" /> {a.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {profile.isSelf && (
            <Link href="/community/saved" className="comic-panel flex items-center gap-3 bg-surface p-3 text-sm font-bold text-foreground hover:bg-muted/40">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-xp/25">
                <Bookmark className="h-4 w-4" aria-hidden="true" />
              </span>
              Saved posts
            </Link>
          )}

          {profile.isSelf && (
            <details id="edit-profile" open={searchParams.edit === "1"} className="comic-panel scroll-mt-20 bg-surface p-4">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-display text-sm font-bold text-primary">
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit your username, bio, headline and privacy
              </summary>
              <div className="mt-4 space-y-4">
                <UsernameForm current={profile.username} />
                <hr className="border-border/15" />
                <ProfileForm initial={{ bio: profile.bio ?? "", headline: profile.headline ?? "", communityPrivate: profile.isPrivate }} />
              </div>
            </details>
          )}

          {!profile.isSelf && (
            <div className="hidden lg:block">
              <ProfileReport userId={profile.id} />
            </div>
          )}
        </aside>

        <div className="mt-3 min-w-0 lg:mt-0">
          {!profile.canSeePosts ? (
            <div className="comic-panel flex items-center gap-3 bg-surface p-5">
              <Lock className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                This profile is private. Follow {profile.name.split(" ")[0]} to see their posts.
              </p>
            </div>
          ) : reels ? (
            <section className="comic-panel bg-surface p-1.5" aria-label="Reels">
              {profile.isSelf && canPostReels && (
                <Link
                  href="/community/reels?create=1"
                  className="mb-1.5 flex h-11 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-bold text-foreground hover:bg-muted/70"
                >
                  <Clapperboard className="h-4 w-4 text-danger" aria-hidden="true" /> Create reel
                </Link>
              )}
              <ul className="grid grid-cols-3 gap-1">
                {reels.posts.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/community/reels?u=${profile.id}&r=${r.id}`}
                      prefetch={false}
                      className="relative block aspect-[9/16] overflow-hidden rounded-md bg-gradient-to-br from-primary to-accent"
                    >
                      {r.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- the reel's cover frame, from /api/files
                        <img src={r.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                      )}
                      <span className="absolute bottom-1 left-1.5 flex items-center gap-0.5 text-xs font-bold text-white drop-shadow">
                        <Play className="h-3 w-3 fill-white" aria-hidden="true" /> {r.video?.views ?? 0}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {reels.posts.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">{profile.isSelf ? "You haven't posted a reel yet." : "No reels yet."}</p>
              )}
            </section>
          ) : initial ? (
            <Feed
              key={profile.id}
              scope={{ type: "profile", userId: profile.id }}
              initial={initial}
              me={me}
              composer={profile.isSelf ? { me, reels: canPostReels } : undefined}
              emptyTitle={profile.isSelf ? "You haven't posted yet" : "No posts yet"}
              emptyBody={profile.isSelf ? "Share something with the community." : `${profile.name} hasn't posted anything yet.`}
            />
          ) : (
            <section className="comic-panel bg-surface p-2" aria-label={show === "followers" ? "Followers" : "Following"}>
              <ul className="grid gap-1 sm:grid-cols-2">
                {(connections ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/50">
                    <Link href={`/community/u/${p.id}`} prefetch={false} className="shrink-0">
                      <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={52} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/community/u/${p.id}`} prefetch={false} className="tap-pad block truncate text-sm font-bold text-foreground hover:underline">
                        {p.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.username && <span className="font-semibold">@{p.username} · </span>}
                        {p.headline ?? `${p.followerCount} follower${p.followerCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {p.id !== user.id && <FollowButton userId={p.id} initialFollowing={p.isFollowing} size="sm" />}
                  </li>
                ))}
              </ul>
              {(connections ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No one here yet.</p>}
            </section>
          )}
          {!profile.isSelf && (
            <div className="mt-4 lg:hidden">
              <ProfileReport userId={profile.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
