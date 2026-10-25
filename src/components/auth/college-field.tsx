"use client";

import { useEffect, useId, useRef, useState } from "react";
import { School } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchInstitutionsAction } from "@/server/actions/student-profile-actions";
import type { InstitutionHit } from "@/server/services/institutions";

const plainName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const inputClass = (error?: string) =>
  cn(
    "h-11 w-full rounded-xl border bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
    error ? "border-danger" : "border-border/60"
  );

/**
 * College name + EIIN with suggestions from the Bangladesh institution list. Typing a name or an
 * EIIN shows matching colleges; picking one fills both fields. A college that isn't listed can
 * still be typed in by hand once the student ticks "My college isn't listed".
 */
export function CollegeField({
  idPrefix,
  name,
  eiin,
  onChange,
  nameError,
  eiinError,
  disabled,
  required,
  notListed,
  onNotListedChange,
}: {
  idPrefix: string;
  notListed: boolean;
  onNotListedChange: (v: boolean) => void;
  name: string;
  eiin: string;
  onChange: (next: { name: string; eiin: string }) => void;
  nameError?: string;
  eiinError?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const listId = useId();
  // The college name already saved (e.g. from before the list existed) is looked up once,
  // silently, so an exact match fills in its EIIN without the student doing anything.
  const [query, setQuery] = useState<{ text: string; from: "name" | "eiin"; silent?: boolean } | null>(
    name.trim().length >= 2 && !eiin ? { text: name, from: "name", silent: true } : null
  );
  const [hits, setHits] = useState<InstitutionHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const latest = useRef({ onChange, onNotListedChange });
  useEffect(() => {
    latest.current = { onChange, onNotListedChange };
  });

  // Debounced search; only the newest answer is shown.
  useEffect(() => {
    if (!query || query.text.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      try {
        const result = await searchInstitutionsAction(query.text);
        if (id !== requestId.current) return;
        // EIIN fills itself: an exact EIIN picks that college, and a name that matches exactly
        // one college gets its EIIN.
        const exact =
          query.from === "eiin"
            ? result.filter((h) => h.eiin === query.text)
            : result.filter((h) => plainName(h.name) === plainName(query.text));
        if (exact.length === 1) {
          latest.current.onChange({ name: exact[0]!.name, eiin: exact[0]!.eiin });
          latest.current.onNotListedChange(false);
          if (query.from === "eiin" || query.silent) {
            setHits([]);
            setOpen(false);
            return;
          }
        }
        setHits(result);
        setActive(-1);
        setOpen(!query.silent);
      } catch {
        if (id === requestId.current) setHits([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(hit: InstitutionHit) {
    onChange({ name: hit.name, eiin: hit.eiin });
    onNotListedChange(false);
    setOpen(false);
    setQuery(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(hits[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && hits.length > 0;
  const comboProps = (field: "name" | "eiin") => ({
    role: "combobox" as const,
    "aria-expanded": showList && query?.from === field,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": showList && active >= 0 && query?.from === field ? `${listId}-${active}` : undefined,
    onKeyDown,
    onFocus: () => hits.length > 0 && setOpen(true),
    autoComplete: "off",
  });

  return (
    <div ref={boxRef} className="relative space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-college`} className="mb-1.5 block text-sm font-medium text-foreground">
          College name {required && <span className="text-danger">*</span>}
        </label>
        <input
          id={`${idPrefix}-college`}
          value={name}
          disabled={disabled}
          placeholder="Start typing your college's name"
          aria-invalid={!!nameError}
          className={inputClass(nameError)}
          onChange={(e) => {
            // A typed name no longer matches the picked college, so its EIIN goes.
            onChange({ name: e.target.value, eiin: "" });
            if (!notListed) setQuery({ text: e.target.value, from: "name" });
          }}
          {...comboProps("name")}
        />
        {nameError && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {nameError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-eiin`} className="mb-1.5 block text-sm font-medium text-foreground">
          College EIIN
        </label>
        <input
          id={`${idPrefix}-eiin`}
          value={eiin}
          disabled={disabled || notListed}
          inputMode="numeric"
          placeholder="Filled in when you pick your college"
          aria-invalid={!!eiinError}
          className={inputClass(eiinError)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 7);
            onChange({ name, eiin: v });
            setQuery({ text: v, from: "eiin" });
          }}
          {...comboProps("eiin")}
        />
        {eiinError && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {eiinError}
          </p>
        )}
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={notListed}
            disabled={disabled}
            onChange={(e) => {
              onNotListedChange(e.target.checked);
              if (e.target.checked) {
                onChange({ name, eiin: "" });
                setOpen(false);
              }
            }}
            className="h-4 w-4"
          />
          My college isn&apos;t in the list
        </label>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute inset-x-0 z-30 max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-surface p-1 shadow-lg",
            query?.from === "eiin" ? "top-full mt-1" : "top-[4.75rem]"
          )}
        >
          {hits.map((hit, i) => (
            <li
              key={hit.eiin}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(hit);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-sm",
                i === active ? "bg-primary/10" : "hover:bg-muted"
              )}
            >
              <School className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{hit.name}</span>
                <span className="block text-xs text-muted-foreground">
                  EIIN {hit.eiin} · {hit.type}
                  {hit.thana || hit.district ? ` · ${[hit.thana, hit.district].filter(Boolean).join(", ")}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
