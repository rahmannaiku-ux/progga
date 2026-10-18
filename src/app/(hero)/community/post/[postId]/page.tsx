import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { displayName } from "@/lib/community/rules";
import { Comments } from "@/components/community/comments";
import { PostDetail } from "@/components/community/post-detail";
import { getComments, getPost } from "@/server/services/community";

export const metadata = { title: "Post" };

/** One post with its discussion. A post the viewer may not see is a 404. */
export default async function CommunityPostPage({ params }: { params: { postId: string } }) {
  const user = await getCurrentUser();
  const post = await getPost(user, params.postId);
  if (!post) notFound();

  const row = await db.communityPost.findUnique({ where: { id: post.id }, select: { groupId: true } });
  const { comments, nextCursor } = await getComments(user, { id: post.id, groupId: row?.groupId ?? null });

  return (
    <div className="mx-auto max-w-[680px] space-y-3">
      <Link href="/community" className="inline-flex h-9 items-center text-sm font-bold text-muted-foreground hover:text-foreground">
        ← Back to the feed
      </Link>
      <PostDetail post={post} me={{ name: displayName(user), avatarUrl: user.avatarUrl }} />
      <Comments
        postId={post.id}
        isQuestion={post.kind === "QUESTION"}
        viewerIsAsker={post.author.id === user.id}
        me={{ name: displayName(user), avatarUrl: user.avatarUrl }}
        initial={comments}
        initialCursor={nextCursor}
        initialAcceptedId={post.acceptedCommentId}
      />
    </div>
  );
}
