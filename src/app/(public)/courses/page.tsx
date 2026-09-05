import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/course/course-card";
import { searchCourses } from "@/server/services/course-catalog";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

// NOT a caching candidate despite having no per-user data: reading
// `searchParams` for the filter form forces Next.js to render this
// dynamically on every request regardless of a `revalidate` export.
// A cacheable version of faceted search needs a different shape (e.g.
// client-side fetching against a cached API route) — noted as a
// follow-up rather than adding a `revalidate` export here that would
// silently do nothing.
export const metadata = { title: "Browse Missions" };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; level?: string; price?: string };
}) {
  const [courses, categories] = await Promise.all([
    searchCourses({
      q: searchParams.q,
      categorySlug: searchParams.category,
      level: searchParams.level,
      price: searchParams.price as "free" | "paid" | undefined,
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="container py-14">
      <StaggerContainer>
      <StaggerItem className="comic-panel halftone-dots relative flex flex-wrap items-center justify-between gap-6 overflow-hidden bg-surface p-8">
        <DoodleStar className="pointer-events-none absolute -left-2 top-4 h-10 w-10 -rotate-12 opacity-70" />
        <DoodleSparkle className="pointer-events-none absolute right-24 top-6 hidden h-8 w-8 opacity-70 sm:block" />
        <div className="relative">
          <h1 className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">
            Choose your <span className="text-primary">mission!</span>
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Each mission = a new skill unlocked. {courses.length} mission{courses.length === 1 ? "" : "s"} match
            your filters right now.
          </p>
        </div>
        <ProggyMascot state="encouraging" className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" groundShadow />
      </StaggerItem>

      <StaggerItem as="section">
      <form className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center" method="GET">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Search missions..."
            className="h-11 w-full rounded-xl border border-border/60 bg-surface pl-10 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <select
          name="category"
          defaultValue={searchParams.category ?? ""}
          className="h-11 rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          name="level"
          defaultValue={searchParams.level ?? ""}
          className="h-11 rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All levels</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
          <option value="ALL_LEVELS">All levels</option>
        </select>

        <select
          name="price"
          defaultValue={searchParams.price ?? ""}
          className="h-11 rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Any price</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>

        <Button type="submit" variant="accent">
          Filter
        </Button>
      </form>
      </StaggerItem>

      {courses.length > 0 ? (
        <StaggerContainer className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <StaggerItem key={c.slug}>
              <CourseCard course={c} accent={i % 2 === 0 ? "purple" : "yellow"} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <div className="comic-panel mt-10 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No missions match those filters yet. Try clearing a filter or check back soon.
          </p>
        </div>
      )}
      </StaggerContainer>
    </div>
  );
}
