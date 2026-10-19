"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createGroup,
  deleteGroup,
  lookUpUsername,
  removeGroupMember,
  respondToJoinRequest,
  setGroupMemberRole,
  setUsername,
  updateCommunityProfile,
  updateGroup,
} from "@/server/actions/community-actions";
import type { UsernameCheck } from "@/server/services/usernames";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const INPUT = "h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const LABEL = "mb-1.5 block text-xs font-bold text-foreground";

/** Create a group, or (with `group`) edit one the viewer owns. */
export function GroupForm({
  group,
}: {
  group?: { id: string; name: string; topic: string; description: string; privacy: "PUBLIC" | "PRIVATE" };
}) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE">(group?.privacy ?? "PUBLIC");
  const [topic, setTopic] = useState(group?.topic ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState({});
        startTransition(async () => {
          try {
            if (group) {
              const res = await updateGroup(group.id, { name, topic, description, privacy });
              setState(res.ok ? { saved: true } : { error: res.error });
              if (res.ok) router.refresh();
            } else {
              const res = await createGroup({ name, topic, description, privacy });
              if (!res.ok) return setState({ error: res.error });
              router.push(`/community/groups/${res.slug}`);
            }
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div>
        <label className={LABEL} htmlFor="group-name">Group name</label>
        <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. HSC Physics study circle" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="group-topic">Topic</label>
        <input id="group-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={40} required placeholder="e.g. Physics" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="group-description">What is it for?</label>
        <textarea
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={600}
          rows={3}
          required
          placeholder="Who should join, and what will you study together?"
          className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <fieldset>
        <legend className={LABEL}>Who can see the posts?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["PUBLIC", "Public", "Anyone can see the posts and join."],
              ["PRIVATE", "Private", "Anyone can find the group, but only members see posts. You approve who joins."],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm",
                privacy === value ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name="group-privacy"
                value={value}
                checked={privacy === value}
                onChange={() => setPrivacy(value)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-bold text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {group && group.privacy === "PRIVATE" && privacy === "PUBLIC" && (
          <p className="mt-1.5 text-xs text-muted-foreground">Making it public lets in everyone who is waiting to join.</p>
        )}
      </fieldset>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.saved && <p role="status" className="text-xs font-semibold text-accent">Saved.</p>}
      <button type="submit" disabled={isPending} className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {group ? "Save changes" : "Create group"}
      </button>
    </form>
  );
}

export function DeleteGroupButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Delete this group and every post in it? This can't be undone.")) return;
          setError(null);
          startTransition(async () => {
            try {
              const res = await deleteGroup(groupId);
              if (!res.ok) return setError(res.error);
              router.push("/community/groups");
            } catch {
              setError(NETWORK_ERROR);
            }
          });
        }}
        className="h-10 text-sm font-bold text-danger hover:underline disabled:opacity-60"
      >
        {isPending ? "Deleting..." : "Delete this group"}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

const ROLE_NAMES = { ADMIN: "Admin", MODERATOR: "Moderator", MEMBER: "Member" } as const;

/**
 * What the viewer may do to one member of a group: give them another role
 * and remove them. Only the choices the viewer is allowed are offered (the
 * server checks again).
 */
export function GroupMemberActions({
  groupId,
  userId,
  name,
  role,
  roles,
  canRemove,
}: {
  groupId: string;
  userId: string;
  name: string;
  role: "ADMIN" | "MODERATOR" | "MEMBER";
  /** Roles the viewer may give this member. */
  roles: ("ADMIN" | "MODERATOR" | "MEMBER")[];
  canRemove: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) return setError(res.error);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };
  if (roles.length <= 1 && !canRemove) return null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span className="flex items-center gap-1">
        {roles.length > 1 && (
          <select
            aria-label={`Role for ${name}`}
            value={role}
            disabled={isPending}
            onChange={(e) => run(() => setGroupMemberRole(groupId, userId, e.target.value))}
            className="h-8 rounded-lg border border-border/60 bg-background px-1.5 text-xs font-bold text-foreground"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
        )}
        {canRemove && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Remove ${name} from the group?`)) run(() => removeGroupMember(groupId, userId));
            }}
            className="h-8 rounded-lg px-2 text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Remove"}
          </button>
        )}
      </span>
      {error && <span role="alert" className="max-w-[12rem] text-right text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

/** Approve or decline one request to join a private group. */
export function JoinRequestButtons({ groupId, userId }: { groupId: string; userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const answer = (approve: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await respondToJoinRequest(groupId, userId, approve);
        if (!res.ok) return setError(res.error);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span className="flex gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={() => answer(true)}
          className="comic-btn h-8 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => answer(false)}
          className="h-8 rounded-lg bg-muted px-3 text-xs font-bold text-foreground disabled:opacity-60"
        >
          Decline
        </button>
      </span>
      {error && <span role="alert" className="text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

export function ProfileForm({ initial }: { initial: { bio: string; headline: string; communityPrivate: boolean } }) {
  const router = useRouter();
  const [bio, setBio] = useState(initial.bio);
  const [headline, setHeadline] = useState(initial.headline);
  const [isPrivate, setIsPrivate] = useState(initial.communityPrivate);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setState({});
        startTransition(async () => {
          try {
            const res = await updateCommunityProfile({ bio, headline, communityPrivate: isPrivate });
            setState(res.ok ? { saved: true } : { error: res.error });
            if (res.ok) router.refresh();
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <div>
        <label className={LABEL} htmlFor="profile-headline">Headline</label>
        <input id="profile-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} placeholder="e.g. HSC 2027 · loves Physics" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="profile-bio">About you</label>
        <textarea
          id="profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What are you studying? What do you want help with?"
          className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          <span className="font-bold">Private profile</span>
          <span className="block text-xs text-muted-foreground">
            Only your followers see your posts, and you won&apos;t be suggested to others. Your name and picture stay visible.
          </span>
        </span>
      </label>
      {state.error && <p role="alert" className="text-xs font-semibold text-danger">{state.error}</p>}
      {state.saved && <p role="status" className="text-xs font-semibold text-accent">Saved.</p>}
      <button type="submit" disabled={isPending} className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save profile
      </button>
    </form>
  );
}

/**
 * Choose your @username. Checks availability as you type and, when the one
 * you want is taken or not allowed, offers the closest free ones to tap.
 */
export function UsernameForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [check, setCheck] = useState<UsernameCheck | null>(current ? { status: "yours", username: current } : null);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<{ error?: string; saved?: string }>({});
  const [isPending, startTransition] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const wanted = value.trim().replace(/^@+/, "");
    if (!wanted) {
      setCheck(null);
      setChecking(false);
      return;
    }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await lookUpUsername(wanted);
        if (mine !== seq.current) return; // a newer keystroke is being checked
        if (res.ok) setCheck(res.check);
        else setState({ error: res.error });
      } catch {
        if (mine === seq.current) setState({ error: NETWORK_ERROR });
      } finally {
        if (mine === seq.current) setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value]);

  const canSave = !checking && check?.status === "available" && !isPending;
  const pick = (u: string) => {
    setState({});
    setValue(u);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        setState({});
        startTransition(async () => {
          try {
            const res = await setUsername(value);
            if (res.ok) {
              setState({ saved: res.username });
              setValue(res.username);
              setCheck({ status: "yours", username: res.username });
              router.refresh();
            } else {
              setState({ error: res.error });
              if ("suggestions" in res && res.suggestions?.length) {
                setCheck({ status: "taken", username: value, message: res.error, suggestions: res.suggestions });
              }
            }
          } catch {
            setState({ error: NETWORK_ERROR });
          }
        });
      }}
    >
      <label className={LABEL} htmlFor="profile-username">Username</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="profile-username"
            value={value}
            onChange={(e) => {
              setState({});
              setValue(e.target.value.replace(/\s+/g, "").toLowerCase());
            }}
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your.name"
            aria-describedby="username-status"
            className={cn(INPUT, "pl-9")}
          />
        </div>
        <button type="submit" disabled={!canSave} className="comic-btn flex h-11 shrink-0 items-center gap-1.5 bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save
        </button>
      </div>
      <div id="username-status" aria-live="polite" className="min-h-5 text-xs">
        {checking ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Checking...
          </span>
        ) : state.saved ? (
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> You are now @{state.saved}
          </span>
        ) : state.error && !(check && "suggestions" in check) ? (
          <span role="alert" className="font-semibold text-danger">{state.error}</span>
        ) : check?.status === "available" ? (
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> @{check.username} is available
          </span>
        ) : check?.status === "yours" ? (
          <span className="text-muted-foreground">This is your username. People can find you as @{check.username}.</span>
        ) : check && "message" in check ? (
          <span className="font-semibold text-danger">{check.message}</span>
        ) : (
          <span className="text-muted-foreground">Letters, numbers, dots and underscores. 3 to 20 characters.</span>
        )}
      </div>
      {!checking && check && "suggestions" in check && check.suggestions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Available instead:</p>
          <div className="flex flex-wrap gap-1.5">
            {check.suggestions.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => pick(u)}
                className="rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-bold text-foreground hover:bg-accent/15"
              >
                @{u}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
