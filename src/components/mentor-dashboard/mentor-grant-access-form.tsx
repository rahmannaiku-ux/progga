"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { grantCourseAccessAsMentor } from "@/server/actions/mentor-actions";

export function MentorGrantAccessForm({ courses }: { courses: { id: string; title: string }[] }) {
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
        const result = await grantCourseAccessAsMentor(email, courseId);
        setSuccess(
          result.alreadyEnrolled
            ? `${result.studentEmail} already had access to "${result.courseTitle}" — nothing to do.`
            : `Granted ${result.studentEmail} access to "${result.courseTitle}".`
        );
        setEmail("");
        setCourseId("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to grant access.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel space-y-3 p-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Student email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@example.com"
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
          <option value="">Select one of your missions...</option>
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
        {isPending ? "Granting access..." : "Grant access"}
      </button>
    </form>
  );
}
