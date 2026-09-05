"use client";

import { useState, useTransition } from "react";
import { adminSetCourseStatus } from "@/server/actions/admin-actions";
import type { CourseStatus } from "@prisma/client";

export function AdminCourseStatusControl({
  courseId,
  status,
}: {
  courseId: string;
  status: CourseStatus;
}) {
  const [value, setValue] = useState(status);
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as CourseStatus;
        setValue(next);
        startTransition(() => adminSetCourseStatus(courseId, next));
      }}
      className="h-8 rounded-lg border border-border/60 bg-surface px-2 text-xs text-foreground"
    >
      <option value="DRAFT">Draft</option>
      <option value="PUBLISHED">Published</option>
      <option value="ARCHIVED">Archived</option>
    </select>
  );
}
