"use client";

import { useRef, useState, useTransition } from "react";
import { createGlobalAnnouncement } from "@/server/actions/admin-actions";

export function AnnouncementForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createGlobalAnnouncement(formData);
      if (result.ok) formRef.current?.reset();
      else setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-3 space-y-3">
      <input
        name="title"
        required
        placeholder="Title"
        className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
      />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Message"
        className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-70"
      >
        {isPending ? "Sending…" : "Send to all users"}
      </button>
    </form>
  );
}
