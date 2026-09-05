import Link from "next/link";
import { Newspaper, Plus, Star } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";
import { BlogStatusSelect } from "@/components/admin-dashboard/blog-status-select";
import { BlogDeleteButton } from "@/components/admin-dashboard/blog-delete-button";

const PAGE_SIZE = 20;

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string; status?: string; category?: string };
}) {
  await requireRole("ADMIN");

  const page = parsePageParam(searchParams.page);
  const statusFilter = searchParams.status || undefined;
  const categoryFilter = searchParams.category || undefined;

  const where: Prisma.BlogPostWhereInput = {
    ...(searchParams.q
      ? {
          OR: [
            { title: { contains: searchParams.q, mode: "insensitive" } },
            { excerpt: { contains: searchParams.q, mode: "insensitive" } },
            { tags: { has: searchParams.q } },
          ],
        }
      : {}),
    ...(statusFilter && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(statusFilter)
      ? { status: statusFilter as "DRAFT" | "PUBLISHED" | "ARCHIVED" }
      : {}),
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
  };

  const [posts, total, categories, statusCounts] = await Promise.all([
    db.blogPost.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: { select: { id: true, name: true } } },
    }),
    db.blogPost.count({ where }),
    db.category.findMany({ orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    db.blogPost.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countFor = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <Newspaper className="h-6 w-6 text-primary" /> Blog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {countFor("PUBLISHED")} published · {countFor("DRAFT")} draft · {countFor("ARCHIVED")} archived
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="comic-btn flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New post
        </Link>
      </div>

      <form method="GET" className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Search title, excerpt, or tag..."
          className="h-10 w-full max-w-sm rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="h-10 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          name="category"
          defaultValue={categoryFilter ?? ""}
          className="h-10 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg border border-border/60 px-4 text-sm font-semibold text-foreground"
        >
          Filter
        </button>
      </form>

      {/* Mobile: one card per post — same actions as the desktop table,
          stacked instead of columned so nothing forces horizontal
          scrolling at 320-390px. */}
      <div className="glass-panel mt-6 md:hidden">
        {posts.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No posts found.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {posts.map((post) => (
              <li key={post.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {post.isFeatured && <Star className="mr-1 inline h-3.5 w-3.5 text-xp" />}
                      {post.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      /{post.slug} {post.category ? `· ${post.category.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <BlogStatusSelect postId={post.id} status={post.status} />
                  <div className="flex shrink-0 items-center gap-3">
                    <Link href={`/admin/blog/${post.id}/edit`} className="text-xs font-semibold text-primary">
                      Edit
                    </Link>
                    <BlogDeleteButton postId={post.id} title={post.title} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border/60">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            basePath="/admin/blog"
            searchParams={{ q: searchParams.q, status: statusFilter, category: categoryFilter }}
          />
        </div>
      </div>

      {/* Desktop table — horizontal scroll is local to this wrapper
          only, never the page. */}
      <div className="glass-panel mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">Title</th>
              <th className="p-4 font-medium">Category</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Updated</th>
              <th className="p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-border/40 last:border-0">
                <td className="max-w-xs p-4 text-foreground">
                  <span className="flex items-center gap-1.5">
                    {post.isFeatured && <Star className="h-3.5 w-3.5 shrink-0 text-xp" />}
                    <span className="truncate font-medium">{post.title}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">/{post.slug}</span>
                </td>
                <td className="p-4 text-muted-foreground">{post.category?.name ?? "—"}</td>
                <td className="p-4">
                  <BlogStatusSelect postId={post.id} status={post.status} />
                </td>
                <td className="p-4 text-muted-foreground">{post.updatedAt.toLocaleDateString()}</td>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/blog/${post.id}/edit`} className="text-xs font-semibold text-primary">
                      Edit
                    </Link>
                    <BlogDeleteButton postId={post.id} title={post.title} />
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No posts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-border/60">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            basePath="/admin/blog"
            searchParams={{ q: searchParams.q, status: statusFilter, category: categoryFilter }}
          />
        </div>
      </div>
    </div>
  );
}
