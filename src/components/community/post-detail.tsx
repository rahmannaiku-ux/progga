"use client";

import { useRouter } from "next/navigation";
import type { PostDTO } from "@/server/services/community";
import { PostCard } from "./post-card";

/** The post at the top of its own page: deleting it returns to the feed. */
export function PostDetail({ post }: { post: PostDTO }) {
  const router = useRouter();
  return (
    <PostCard
      post={post}
      linkToPost={false}
      onDeleted={() => {
        router.push("/community");
        router.refresh();
      }}
      onShared={() => router.refresh()}
    />
  );
}
