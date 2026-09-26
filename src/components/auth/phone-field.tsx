"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function PhoneField({
  value,
  onChange,
  error,
  disabled,
  autoFocus,
  label = "Phone number",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="01XXXXXXXXX"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
          error ? "border-danger" : "border-border/60"
        )}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
