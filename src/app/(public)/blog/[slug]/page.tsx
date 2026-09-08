import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { formatDhakaDate } from "@/lib/timezone";
import { isSafeDestinationUrl } from "@/lib/config/destinations";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const post = await db.blogPost.findFirst({
    where: { slug: params.slug, status: "PUBLISHED" },
    select: { title: true, excerpt: true, seoTitle: true, seoDescription: true },
  });
  if (!post) return {};
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  // Draft/archived posts 404 here exactly like a nonexistent slug —
  // status is never leaked to a visitor who doesn't already have admin
  // access, and a direct link to an unpublished post fails the same
  // safe way as a typo'd one.
  const post = await db.blogPost.findFirst({
    where: { slug: params.slug, status: "PUBLISHED" },
    include: { category: { select: { name: true, slug: true } } },
  });

  if (!post) notFound();

  const hasSafeCover = Boolean(post.coverImageUrl && isSafeDestinationUrl(post.coverImageUrl));

  return (
    <article className="container max-w-2xl py-14">
      {hasSafeCover && (
        <div className="mb-8 aspect-[16/7] w-full overflow-hidden rounded-2xl bg-muted">
          {/* Plain <img> — see the blog list page for why next/image
              isn't used for admin-pasted cover URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.coverImageUrl!} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {post.category && (
          <Link href={`/courses?category=${post.category.slug}`} className="font-semibold text-primary">
            {post.category.name}
          </Link>
        )}
        <span>
          {post.publishedAt && formatDhakaDate(post.publishedAt)}{" "}
          · {post.authorName}
        </span>
      </div>

      <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">
        {post.title}
      </h1>

      {/* contentHtml is sanitized on write (see blog-actions.ts) and
          sanitized again here — defense in depth against a future
          lower-trust authoring role, a compromised dependency, or a
          bad paste directly into the DB. */}
      <div
        className="prose prose-invert mt-8 max-w-none text-sm leading-relaxed text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.contentHtml) }}
      />

      {post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5 border-t border-border/60 pt-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Link href="/blog" className="text-sm font-semibold text-primary">
          ← Back to the Field Log
        </Link>
      </div>
    </article>
  );
}
