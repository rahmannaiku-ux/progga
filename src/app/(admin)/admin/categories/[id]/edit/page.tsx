import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { CategoryForm } from "@/components/admin-dashboard/category-form";

export default async function EditCategoryPage({ params }: { params: { id: string } }) {
  await requireRole("ADMIN");

  const category = await db.category.findUnique({ where: { id: params.id } });
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/admin/categories"
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Categories
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Edit category</h1>

      <div className="glass-panel mt-6 p-5">
        <CategoryForm existing={category} />
      </div>
    </div>
  );
}
