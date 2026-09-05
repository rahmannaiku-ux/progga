import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { createCourse } from "@/server/actions/mission-actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";

export default async function NewMissionPage() {
  await requireRole("TEACHER");
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Start a new mission
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You'll add operations, chapters, and patrols in the builder right
        after this.
      </p>

      <form action={createCourse} className="glass-panel mt-8 space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            name="title"
            required
            minLength={5}
            placeholder="e.g. Full-Stack Web Development"
            className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Subtitle <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            name="subtitle"
            placeholder="A one-line hook for the catalog card"
            className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Description
          </label>
          <textarea
            name="description"
            required
            minLength={20}
            rows={5}
            placeholder="What will heroes be able to do after completing this mission?"
            className="w-full rounded-xl border border-border/60 bg-surface px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Category
            </label>
            <select
              name="categoryId"
              className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Level
            </label>
            <select
              name="level"
              defaultValue="ALL_LEVELS"
              className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
              <option value="ALL_LEVELS">All levels</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="isFree" name="isFree" className="h-4 w-4" />
          <label htmlFor="isFree" className="text-sm text-foreground">
            This mission is free
          </label>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Price (USD cents) — ignored if free
          </label>
          <input
            type="number"
            name="priceCents"
            min={0}
            defaultValue={0}
            className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <SubmitButton
          pendingLabel="Creating mission…"
          className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
        >
          Create mission & open builder
        </SubmitButton>
      </form>
    </div>
  );
}
