"use client";

import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";
import { deleteBlogPost } from "@/server/actions/blog-actions";

export function BlogDeleteButton({ postId, title }: { postId: string; title: string }) {
  return (
    <ConfirmDeleteButton
      action={() => deleteBlogPost(postId)}
      confirmMessage={`Delete "${title}"? This can't be undone.`}
    />
  );
}
