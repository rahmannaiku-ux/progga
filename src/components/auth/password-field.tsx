"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  error?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface px-4 pr-11 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
            error ? "border-danger" : "border-border/60"
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
