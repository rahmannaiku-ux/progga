import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/community/rules";
import { formatDhakaDateTime } from "@/lib/timezone";
import { CommunityReportControls } from "@/components/admin-dashboard/community-report-controls";

const NAME = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Admin: the Community moderation queue. Reports students filed about
 * posts, comments and profiles, with the content in question and the
 * decision controls. Handled reports stay listed with who decided and why.
 */
export default async function AdminCommunityPage(props: { searchParams: Promise<{ view?: string }> }) {
  const searchParams = await props.searchParams;
  await requireRole("ADMIN");
  const view = searchParams.view === "handled" ? "handled" : "open";

  const [reports, openCount] = await Promise.all([
    db.communityReport.findMany({
      where: view === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } },
      orderBy: view === "open" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      take: 50,
      include: {
        reporter: NAME,
        reviewedBy: NAME,
        targetUser: NAME,
        post: { select: { id: true, content: true, imageUrl: true, isHidden: true, author: NAME } },
        comment: { select: { id: true, content: true, isHidden: true, postId: true, author: NAME } },
      },
    }),
    db.communityReport.count({ where: { status: "OPEN" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Community moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reports from the Community. Hiding keeps the content for the record; deleting removes it. Suspending uses the
          same account suspension as Admin → Users, and every decision is written to the audit log.
        </p>
      </div>

      <div className="flex gap-2">
        {(["open", "handled"] as const).map((v) => (
          <Link
            key={v}
            href={v === "open" ? "/admin/community" : "/admin/community?view=handled"}
            className={cn(
              "flex h-10 items-center rounded-lg px-4 text-sm font-semibold",
              view === v ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
            )}
          >
            {v === "open" ? `Open (${openCount})` : "Handled"}
          </Link>
        ))}
      </div>

      {reports.length === 0 && (
        <p className="glass-panel p-6 text-sm text-muted-foreground">
          {view === "open" ? "No open reports. Nothing needs you right now." : "No handled reports yet."}
        </p>
      )}

      {reports.map((r) => {
        const author = r.post?.author ?? r.comment?.author ?? r.targetUser;
        const content = r.post?.content ?? r.comment?.content ?? null;
        const postId = r.post?.id ?? r.comment?.postId ?? null;
        return (
          <article key={r.id} className="glass-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{r.targetType.toLowerCase()}</span> reported by{" "}
                {displayName(r.reporter)} · {formatDhakaDateTime(r.createdAt)}
              </span>
              <span className="rounded-full bg-danger/15 px-2 py-0.5 font-bold text-danger">{r.reason}</span>
            </div>

            {r.details && <p className="text-sm text-foreground">“{r.details}”</p>}

            <div className="rounded-lg border border-border/40 bg-muted/50 p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {author ? (
                  <>
                    By{" "}
                    <Link href={`/community/u/${author.id}`} className="text-foreground hover:underline">
                      {displayName(author)}
                    </Link>
                  </>
                ) : (
                  "Content no longer exists"
                )}
                {(r.post?.isHidden || r.comment?.isHidden) && " · currently hidden"}
              </p>
              {content ? (
                <p className="mt-1 line-clamp-6 whitespace-pre-wrap break-words text-sm text-foreground">{content}</p>
              ) : (
                r.targetType !== "PROFILE" && <p className="mt-1 text-sm italic text-muted-foreground">(no text)</p>
              )}
              {r.post?.imageUrl && <p className="mt-1 text-xs text-muted-foreground">Has a picture attached.</p>}
              {postId && (
                <Link href={`/community/post/${postId}`} className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
                  Open in the Community →
                </Link>
              )}
            </div>

            {r.status === "OPEN" ? (
              <CommunityReportControls reportId={r.id} hasContent={Boolean(r.post || r.comment)} />
            ) : (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{r.status === "ACTIONED" ? "Action taken" : "Dismissed"}</span>
                {r.reviewedBy && ` by ${displayName(r.reviewedBy)}`}
                {r.reviewedAt && ` · ${formatDhakaDateTime(r.reviewedAt)}`}
                {r.reviewNote && ` · ${r.reviewNote}`}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
