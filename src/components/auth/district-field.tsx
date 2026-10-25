"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchDistricts } from "@/lib/bd-districts";

/** District with the 64 districts of Bangladesh as suggestions (English, old spellings or Bangla). */
export function DistrictField({
  id,
  value,
  onChange,
  error,
  disabled,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => matchDistricts(value).slice(0, 64), [value]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        District {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder="Type or pick your district"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={!!error}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onBlur={() => {
          // An exact match (any spelling) becomes the official name.
          const exact = matchDistricts(value)[0];
          if (exact && value.trim() && (exact.name.toLowerCase() === value.trim().toLowerCase() || exact.bn === value.trim())) {
            onChange(exact.name);
          }
        }}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(hits[active]!.name);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
          error ? "border-danger" : "border-border/60"
        )}
      />
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {open && hits.length > 0 && !(hits.length === 1 && hits[0]!.name === value) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-surface p-1 shadow-lg"
        >
          {hits.map((d, i) => (
            <li
              key={d.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(d.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                i === active ? "bg-primary/10" : "hover:bg-muted"
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="font-semibold text-foreground">{d.name}</span>
              <span className="text-muted-foreground">{d.bn}</span>
              <span className="ml-auto text-xs text-muted-foreground">{d.division}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
