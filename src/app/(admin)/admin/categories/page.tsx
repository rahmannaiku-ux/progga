import { Layers } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { CategoryForm } from "@/components/admin-dashboard/category-form";
import { CategoryDeleteControl } from "@/components/admin-dashboard/category-delete-control";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireRole("ADMIN");

  const q = searchParams.q?.trim();

  const [categories, allCategoriesForReassign] = await Promise.all([
    db.category.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { courses: true, blogPosts: true, children: true } } },
    }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
        <Layers className="h-6 w-6 text-primary" /> Categories
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Used across missions, the public Categories page, and blog posts.
      </p>

      <form method="GET" className="mt-6">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search categories..."
          className="h-10 w-full max-w-sm rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        />
      </form>

      <div className="mt-4 space-y-2">
        {categories.map((c) => {
          const dependentCount = c._count.courses + c._count.blogPosts + c._count.children;
          return (
            <div key={c.id} className="glass-panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {c.name}
                  {!c.isActive && (
                    <span className="sticker-badge bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  /{c.slug} · {c._count.courses} missions · {c._count.blogPosts} posts · order {c.displayOrder}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/admin/categories/${c.id}/edit`}
                  className="text-xs font-semibold text-primary"
                >
                  Edit
                </Link>
                <CategoryDeleteControl
                  categoryId={c.id}
                  name={c.name}
                  dependentCount={dependentCount}
                  otherCategories={allCategoriesForReassign.filter((o) => o.id !== c.id)}
                />
              </div>
            </div>
          );
        })}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {q ? "No categories match your search." : "No categories yet."}
          </p>
        )}
      </div>

      <div className="glass-panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Add a category</h2>
        <div className="mt-3">
          <CategoryForm />
        </div>
      </div>
    </div>
  );
}
