"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addStudentEmailAction } from "@/server/actions/student-profile-actions";

/** One field, saved once: for students who finished their profile before email was required. */
export function AddEmailForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await addStudentEmailAction({ email });
        if (result.ok) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setError(result.message);
      } catch {
        setError("Your session has expired. Please sign in again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="comic-panel-bold space-y-4 bg-surface p-5 sm:p-6">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
          Email <span className="text-danger">*</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          placeholder="you@example.com"
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : "email-note"}
          className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
        />
        {error ? (
          <p id="email-error" role="alert" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          <p id="email-note" className="mt-1.5 text-sm text-muted-foreground">
            You can save this once. After that it can&apos;t be changed from your profile.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending || email.trim().length === 0}>
        {isPending ? "Saving..." : "Save email"}
      </Button>
    </form>
  );
}
