"use client";

import { useRouter } from "next/navigation";
import type { PostDTO } from "@/server/services/community";
import { PostCard, type Viewer } from "./post-card";

/** The post at the top of its own page: deleting it returns to the feed. */
export function PostDetail({ post, me }: { post: PostDTO; me: Viewer }) {
  const router = useRouter();
  return (
    <PostCard
      post={post}
      me={me}
      linkToPost={false}
      onDeleted={() => {
        router.push("/community");
        router.refresh();
      }}
      onShared={() => router.refresh()}
    />
  );
}
