"use client";

import { useState, useTransition } from "react";
import { Rocket, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCoursePublishState } from "@/server/actions/mission-actions";
import type { CourseStatus } from "@prisma/client";

export function PublishToggle({
  courseId,
  status,
}: {
  courseId: string;
  status: CourseStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPublished = status === "PUBLISHED";

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setCoursePublishState(courseId, !isPublished);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={toggle}
        disabled={isPending}
        variant={isPublished ? "outline" : "accent"}
      >
        {isPublished ? (
          <>
            <EyeOff className="h-4 w-4" /> Unpublish
          </>
        ) : (
          <>
            <Rocket className="h-4 w-4" /> Publish mission
          </>
        )}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
