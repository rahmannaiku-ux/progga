import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { BlogPostForm } from "@/components/admin-dashboard/blog-post-form";

export default async function NewBlogPostPage() {
  const admin = await requireRole("ADMIN");

  const [categories, adminUser] = await Promise.all([
    db.category.findMany({ orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    db.user.findUnique({ where: { id: admin.id }, select: { firstName: true, lastName: true } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/blog"
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Blog
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">New post</h1>

      <div className="mt-6">
        <BlogPostForm
          categories={categories}
          defaultAuthorName={
            adminUser ? `${adminUser.firstName} ${adminUser.lastName}`.trim() : ""
          }
        />
      </div>
    </div>
  );
}
