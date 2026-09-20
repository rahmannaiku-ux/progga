"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createBlogPost, updateBlogPost } from "@/server/actions/blog-actions";

type CategoryOption = { id: string; name: string };

type ExistingPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  authorName: string;
  categoryId: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
};

const inputClass =
  "h-11 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const labelClass = "text-xs font-semibold text-muted-foreground";

export function BlogPostForm({
  categories,
  existing,
  defaultAuthorName,
}: {
  categories: CategoryOption[];
  existing?: ExistingPost;
  defaultAuthorName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Plain onSubmit + FormData(e.currentTarget), not <form action={fn}>:
  // this project pins react@18.3.1/next@14.2.5 (stable, not the React 19
  // form-action-for-any-function API), so the action prop only
  // intercepts actual Server Actions. This mirrors the same
  // controlled-submit approach already used in destination-row.tsx.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    if (existing) formData.set("id", existing.id);
    startTransition(async () => {
      const result = existing
        ? await updateBlogPost(formData)
        : await createBlogPost(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The server action already revalidated /admin/blog, so a single
      // navigation is enough — an extra router.refresh() re-fetched the
      // page a second time.
      router.push("/admin/blog");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={160}
          defaultValue={existing?.title}
          placeholder="How Proggaa students learn to debug faster"
          className={`${inputClass} mt-1`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="slug">
          Slug{" "}
          <span className="font-normal text-muted-foreground">
            (leave blank to auto-generate from title)
          </span>
        </label>
        <input
          id="slug"
          name="slug"
          maxLength={160}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          defaultValue={existing?.slug}
          placeholder="how-proggaa-students-learn-to-debug-faster"
          className={`${inputClass} mt-1 font-mono text-sm`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="excerpt">
          Excerpt <span className="font-normal text-muted-foreground">(shown on the list page, max 300 chars)</span>
        </label>
        <textarea
          id="excerpt"
          name="excerpt"
          required
          rows={2}
          maxLength={300}
          defaultValue={existing?.excerpt}
          className={`${inputClass} mt-1 h-auto py-2`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="contentHtml">
          Content (HTML){" "}
          <span className="font-normal text-muted-foreground">
            sanitized on save — scripts and unknown tags are stripped
          </span>
        </label>
        <textarea
          id="contentHtml"
          name="contentHtml"
          required
          rows={14}
          defaultValue={existing?.contentHtml}
          className={`${inputClass} mt-1 h-auto py-2 font-mono text-sm`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="coverImageUrl">
            Cover image URL
          </label>
          <input
            id="coverImageUrl"
            name="coverImageUrl"
            type="url"
            maxLength={2048}
            defaultValue={existing?.coverImageUrl ?? ""}
            placeholder="https://utfs.io/f/..."
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Upload through the existing file uploader first — images from hosts outside the
            site's allowlist won't render on the public page.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="authorName">
            Author name
          </label>
          <input
            id="authorName"
            name="authorName"
            required
            maxLength={120}
            defaultValue={existing?.authorName ?? defaultAuthorName}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="categoryId">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={existing?.categoryId ?? ""}
            className={`${inputClass} mt-1`}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="tags">
            Tags <span className="font-normal text-muted-foreground">(comma-separated)</span>
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={existing?.tags.join(", ")}
            placeholder="debugging, tips, javascript"
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={existing?.status ?? "DRAFT"}
            className={`${inputClass} mt-1`}
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <label className="mt-6 flex items-center gap-2 text-sm text-foreground sm:mt-auto sm:pb-3">
          <input
            type="checkbox"
            name="isFeatured"
            defaultChecked={existing?.isFeatured}
            className="h-4 w-4 rounded border-border/60"
          />
          Featured post
        </label>
      </div>

      <div className="rounded-lg border border-border/60 p-4">
        <p className="text-xs font-bold text-foreground">SEO (optional)</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="seoTitle">
              SEO title <span className="font-normal text-muted-foreground">(≤70 chars)</span>
            </label>
            <input
              id="seoTitle"
              name="seoTitle"
              maxLength={70}
              defaultValue={existing?.seoTitle ?? ""}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="seoDescription">
              SEO description <span className="font-normal text-muted-foreground">(≤160 chars)</span>
            </label>
            <input
              id="seoDescription"
              name="seoDescription"
              maxLength={160}
              defaultValue={existing?.seoDescription ?? ""}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="comic-btn h-11 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {isPending ? "Saving..." : existing ? "Save changes" : "Create post"}
        </button>
        {existing?.status === "PUBLISHED" && existing.slug && (
          <a
            href={`/blog/${existing.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-primary"
          >
            Preview live →
          </a>
        )}
      </div>
    </form>
  );
}
