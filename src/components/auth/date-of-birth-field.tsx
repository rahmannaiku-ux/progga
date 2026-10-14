"use client";

import { Cake, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_OF_BIRTH_PRIVACY_NOTE } from "@/lib/birthday/reward-rules";

/**
 * Date of birth input: the browser's own date picker (keyboard and screen
 * reader friendly on every platform), bounded to real past dates. The
 * server validates again; `max` is today's date in Dhaka, passed in by the
 * page so the browser's clock doesn't decide.
 */
export function DateOfBirthField({
  id = "dateOfBirth",
  value,
  onChange,
  error,
  disabled,
  max,
  required = true,
  label = "Date of birth",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  max: string;
  required?: boolean;
  label?: string;
}) {
  const noteId = `${id}-note`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Cake className="h-4 w-4 text-accent" aria-hidden="true" />
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={id}
        type="date"
        autoComplete="bday"
        value={value}
        min="1900-01-01"
        max={max}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${noteId} ${id}-error` : noteId}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
          error ? "border-danger" : "border-border/60"
        )}
      />
      <p id={noteId} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {DATE_OF_BIRTH_PRIVACY_NOTE}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
