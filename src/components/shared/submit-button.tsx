"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for a raw `<button type="submit">` inside a
 * `<form action={someServerAction}>`. Plain submit buttons give zero
 * visual feedback between click and the page re-rendering with fresh
 * data — on the mentor builder page in particular, where a single
 * mission can have a dozen-plus of these forms (add operation, add
 * chapter, add class type, add patrol, one per row), that silence
 * reads as the page being stuck rather than working. `useFormStatus`
 * only works when this component is rendered *inside* the `<form>`
 * it reports on — it can't be a wrapper around one.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={cn(className, pending && "opacity-70")}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
