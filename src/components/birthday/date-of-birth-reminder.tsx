"use client";

import { useEffect, useState } from "react";
import { Cake, X } from "lucide-react";
import { AddDateOfBirthForm } from "@/components/profile/add-date-of-birth-form";

const SNOOZE_KEY = "proggaa:dob-reminder-snoozed-until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Profile-completion reminder for students who finished their profile
 * before date of birth was asked for. Optional and dismissible (snoozed for
 * two weeks in this browser only); it never blocks learning or exams.
 */
export function DateOfBirthReminder({ max }: { max: string }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      setVisible(!(until > Date.now()));
    } catch {
      setVisible(true);
    }
  }, []);

  function snooze() {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // storage blocked: just hide for this page view
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section aria-labelledby="dob-reminder-title" className="comic-panel relative mb-5 bg-surface p-4 sm:p-5">
      <button
        type="button"
        onClick={snooze}
        aria-label="Remind me later"
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-xp/20">
          <Cake className="h-5 w-5 text-xp-ink" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="dob-reminder-title" className="font-display text-base font-extrabold text-foreground">
            Finish your profile: add your birthday
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Heroes get a birthday surprise from Proggaa, including bonus Proggy Coins. Your date of birth stays private.
          </p>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 text-sm font-bold text-accent hover:text-accent/80"
            >
              Add date of birth →
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 max-w-sm">
          <AddDateOfBirthForm max={max} idPrefix="dashboard-dob" />
        </div>
      )}
    </section>
  );
}
