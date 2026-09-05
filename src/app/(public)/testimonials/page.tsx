import { Star } from "lucide-react";
import { testimonials } from "@/lib/data/testimonials";
import { DoodleStar } from "@/components/marketing/cartoon-doodles";

export const metadata = { title: "Testimonials" };

const AVATAR_THEMES = ["bg-primary", "bg-accent", "bg-xp"];

export default function TestimonialsPage() {
  return (
    <div className="halftone-dots container py-14">
      <h1 className="font-display text-3xl font-bold text-foreground">
        What heroes are saying
      </h1>
      <p className="mt-2 text-muted-foreground">
        Illustrative feedback while our first cohorts get underway — real
        stories replace these as missions launch.
      </p>

      <div className="mt-10 grid gap-x-6 gap-y-10 lg:grid-cols-3">
        {testimonials.map((t, i) => (
          <div key={t.name} className="flex flex-col items-start">
            {/* Speech bubble */}
            <div className="comic-panel relative w-full bg-surface p-6">
              {i === 0 && (
                <DoodleStar className="pointer-events-none absolute -right-3 -top-3 h-10 w-10 rotate-12" />
              )}
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, star) => (
                  <Star key={star} className="h-4 w-4 fill-xp text-xp" />
                ))}
              </div>
              <p className="mt-3 text-sm text-foreground">"{t.quote}"</p>

              {/* Speech bubble tail — a rotated square clipped to a
                  triangle, borrowing the panel's own border color so it
                  reads as one continuous shape pointing at the avatar
                  below. */}
              <span
                className="absolute -bottom-[13px] left-10 h-6 w-6 rotate-45 border-b-[3px] border-r-[3px] border-border bg-surface"
                aria-hidden="true"
              />
            </div>

            {/* Avatar + name, sitting just below the tail */}
            <div className="mt-6 flex items-center gap-3 pl-6">
              <span
                className={`sticker flex h-11 w-11 shrink-0 items-center justify-center font-display text-base font-bold text-white ${AVATAR_THEMES[i % AVATAR_THEMES.length]}`}
              >
                {t.name.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
