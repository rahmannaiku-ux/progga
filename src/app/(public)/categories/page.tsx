import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { db } from "@/lib/db/client";
import { DoodleSparkle, DoodleStar } from "@/components/marketing/cartoon-doodles";

export const metadata = { title: "Categories" };

// Rotating "collectible card" color set — each category cycles through
// these so the grid reads as a set of distinct collectibles rather than
// identical bordered boxes. All values are theme CSS vars, so this still
// adapts correctly between light/dark cartoon mode.
const CARD_THEMES = [
  { bg: "bg-primary/10", ring: "text-primary", icon: "bg-primary" },
  { bg: "bg-accent/10", ring: "text-accent", icon: "bg-accent" },
  { bg: "bg-xp/10", ring: "text-xp", icon: "bg-xp" },
  { bg: "bg-danger/10", ring: "text-danger", icon: "bg-danger" },
];

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { courses: true } } },
  });

  return (
    <div className="halftone-dots container py-14">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-xp" />
        <h1 className="font-display text-3xl font-bold text-foreground">
          Categories
        </h1>
      </div>
      <p className="mt-2 text-muted-foreground">
        Pick a discipline and see every mission inside it.
      </p>

      {categories.length > 0 ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, i) => {
            const theme = CARD_THEMES[i % CARD_THEMES.length]!;
            const showDoodle = i % 3 === 1;
            return (
              <Link
                key={cat.id}
                href={`/courses?category=${cat.slug}`}
                className={`comic-panel hover-glow-card relative flex items-center justify-between overflow-hidden p-6 ${theme.bg}`}
              >
                {showDoodle ? (
                  <DoodleSparkle className="pointer-events-none absolute -right-2 -top-2 h-14 w-14 rotate-12 opacity-70" />
                ) : (
                  <DoodleStar className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rotate-12 opacity-60" />
                )}

                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[2.5px] border-border ${theme.icon}`}
                  >
                    <BookOpen className="h-5 w-5 text-white" />
                  </span>
                  <span className="font-display text-lg font-bold text-foreground">
                    {cat.name}
                  </span>
                </div>

                <span
                  className={`sticker shrink-0 px-3 py-1 font-mono text-xs font-bold ${theme.ring}`}
                >
                  {cat._count.courses}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="comic-panel mt-10 p-10 text-center text-sm text-muted-foreground">
          Categories will appear here once an admin adds them.
        </div>
      )}
    </div>
  );
}
