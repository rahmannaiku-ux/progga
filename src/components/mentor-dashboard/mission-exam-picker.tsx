"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";

/**
 * "Pick a mission → go to its exam editor". This used to be a <form> bound
 * to a Server Action that only called redirect(): a full POST to the server
 * plus a redirect response just to change page. A plain client-side
 * navigation is one hop and gets the route's prefetch and loading skeleton.
 */
export function MissionExamPicker({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");

  return (
    <form
      className="glass-panel mt-4 flex flex-wrap items-center gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (courseId) router.push(`/mentor/missions/${courseId}/assessments`);
      }}
    >
      <PlusCircle className="h-5 w-5 shrink-0 text-primary" />
      <select
        name="courseId"
        required
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="h-10 flex-1 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
      >
        <option value="" disabled>
          Choose a mission to create an exam in…
        </option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!courseId}
        className="comic-btn h-10 shrink-0 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        Create exam
      </button>
    </form>
  );
}
