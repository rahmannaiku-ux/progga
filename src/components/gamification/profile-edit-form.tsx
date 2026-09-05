"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/server/actions/profile-actions";

export function ProfileEditForm({
  initialHeadline,
  initialBio,
}: {
  initialHeadline: string;
  initialBio: string;
}) {
  const [headline, setHeadline] = useState(initialHeadline);
  const [bio, setBio] = useState(initialBio);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="glass-panel p-5">
      <h2 className="font-display text-sm font-semibold text-foreground">
        Edit profile
      </h2>
      <div className="mt-3 space-y-3">
        <input
          value={headline}
          onChange={(e) => {
            setHeadline(e.target.value);
            setSaved(false);
          }}
          placeholder="Headline, e.g. Aspiring Full-Stack Hero"
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
        />
        <textarea
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setSaved(false);
          }}
          placeholder="A short bio..."
          rows={3}
          className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await updateProfile({ headline, bio });
              setSaved(true);
            });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
