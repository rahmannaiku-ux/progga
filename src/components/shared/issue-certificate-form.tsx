"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";

type IssueResult =
  | { ok: true; alreadyIssued: boolean; issued: boolean; studentLabel: string; courseTitle: string }
  | { ok: false; error: string };

export function IssueCertificateForm({
  courses,
  action,
}: {
  courses: { id: string; title: string }[];
  action: (email: string, courseId: string) => Promise<IssueResult>;
}) {
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const r = await action(email, courseId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (r.alreadyIssued) {
          setSuccess(`${r.studentLabel} already has a medal for "${r.courseTitle}".`);
        } else if (r.issued) {
          setSuccess(`Issued a medal to ${r.studentLabel} for "${r.courseTitle}".`);
        } else {
          setError(
            `The medal for ${r.studentLabel} was created but the PDF couldn't be generated. Try again shortly.`
          );
        }
        if (r.issued) {
          setEmail("");
          setCourseId("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to issue medal.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel space-y-3 p-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Student phone or email</label>
        <input
          type="text"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="017XXXXXXXX or student@example.com"
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Mission</label>
        <select
          required
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        >
          <option value="">Select a mission...</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {success}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? "Issuing medal..." : "Issue medal"}
      </button>
    </form>
  );
}
