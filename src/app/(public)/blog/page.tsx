import Link from "next/link";
import { db } from "@/lib/db/client";
import { isSafeDestinationUrl } from "@/lib/config/destinations";

export const metadata = { title: "Blog" };

const POSTS_PER_PAGE = 12;

export default async function BlogPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);

  // Public listing only ever reads PUBLISHED posts — draft/archived
  // content is invisible here no matter how it's linked to, the same
  // guarantee the [slug] page enforces on direct access.
  const [posts, totalCount] = await Promise.all([
    db.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      skip: (page - 1) * POSTS_PER_PAGE,
      take: POSTS_PER_PAGE,
      include: { category: { select: { name: true, slug: true } } },
    }),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / POSTS_PER_PAGE));

  return (
    <div className="container max-w-3xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        The Field Log
      </h1>
      <p className="mt-2 text-muted-foreground">
        Notes on learning, teaching, and building missions worth finishing.
      </p>

      {posts.length > 0 ? (
        <div className="mt-10 space-y-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="glass-panel block overflow-hidden p-6 transition-transform hover:-translate-y-0.5"
            >
              {post.coverImageUrl && isSafeDestinationUrl(post.coverImageUrl) && (
                <div className="relative -mx-6 -mt-6 mb-4 aspect-[16/7] w-[calc(100%+3rem)] overflow-hidden bg-muted">
                  {/* Plain <img>, not next/image: cover images are an
                      admin-pasted URL, not guaranteed to be on the
                      next.config.js remotePatterns allowlist. next/image
                      throws at render time for an unlisted host, which
                      would break the whole page — a plain <img> just
                      silently fails to load (browser CSP already
                      restricts img-src to approved hosts), which is the
                      "fail safely" behavior this page needs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {post.isFeatured && (
                  <span className="sticker-badge bg-xp/15 px-2 py-0.5 font-bold text-xp-foreground">
                    Featured
                  </span>
                )}
                {post.category && (
                  <span className="font-semibold text-primary">{post.category.name}</span>
                )}
                <span>
                  {post.publishedAt?.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {post.authorName}
                </span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-foreground">
                {post.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{post.excerpt}</p>
              {post.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-panel mt-10 p-10 text-center text-sm text-muted-foreground">
          No posts published yet — the first Field Log entry is on its way.
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/blog?page=${page - 1}`} className="font-semibold text-primary">
              ← Newer
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/blog?page=${page + 1}`} className="font-semibold text-primary">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
