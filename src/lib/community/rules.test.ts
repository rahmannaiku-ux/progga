import { describe, expect, it } from "vitest";
import {
  canDeleteContent,
  canEditContent,
  canManageGroup,
  canModerateGroup,
  canSeeProfilePosts,
  cleanPollOptions,
  commentInputSchema,
  communityTimeAgo,
  conversationPair,
  conversationSide,
  decodeCursor,
  encodeCursor,
  groupInputSchema,
  groupSlug,
  isCommunityImageUrl,
  postInputSchema,
  reactionSummary,
  reportInputSchema,
  splitLinks,
} from "@/lib/community/rules";

describe("post input", () => {
  const parse = (input: unknown) => postInputSchema.safeParse(input);

  it("accepts a plain text post and trims it", () => {
    const res = parse({ content: "  hello  " });
    expect(res.success && res.data.content).toBe("hello");
    expect(res.success && res.data.kind).toBe("POST");
  });

  it("rejects an empty post, but allows a picture or a share on its own", () => {
    expect(parse({ content: "   " }).success).toBe(false);
    expect(parse({ content: "", imageUrl: "/api/files/abc12345" }).success).toBe(true);
    expect(parse({ content: "", sharedPostId: "cuid123456" }).success).toBe(true);
  });

  it("rejects a picture that is not a file this site stored", () => {
    expect(parse({ content: "x", imageUrl: "https://evil.example/x.png" }).success).toBe(false);
    expect(parse({ content: "x", imageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(isCommunityImageUrl("/api/files/../../etc/passwd")).toBe(false);
    expect(isCommunityImageUrl("https://utfs.io/f/abc123-def.png")).toBe(true);
  });

  it("rejects text over the limit", () => {
    expect(parse({ content: "a".repeat(5001) }).success).toBe(false);
  });

  it("requires detail for a question", () => {
    expect(parse({ kind: "QUESTION", content: "help" }).success).toBe(false);
    expect(parse({ kind: "QUESTION", content: "How do I balance this equation?" }).success).toBe(true);
  });

  it("requires a question and 2-6 distinct options for a poll", () => {
    expect(parse({ kind: "POLL", content: "Best subject?", pollOptions: ["Physics"] }).success).toBe(false);
    expect(parse({ kind: "POLL", content: "Best subject?", pollOptions: ["Physics", "physics ", ""] }).success).toBe(false);
    expect(parse({ kind: "POLL", content: "Best subject?", pollOptions: ["Physics", "Math"] }).success).toBe(true);
    expect(parse({ kind: "POLL", content: "Best subject?", pollOptions: ["1", "2", "3", "4", "5", "6", "7"] }).success).toBe(false);
    expect(parse({ kind: "POLL", content: "", pollOptions: ["a", "b"] }).success).toBe(false);
  });

  it("drops fields it does not know (no mass assignment)", () => {
    const res = parse({ content: "hi", authorId: "someone-else", isHidden: true, role: "ADMIN" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).not.toHaveProperty("authorId");
      expect(res.data).not.toHaveProperty("isHidden");
      expect(res.data).not.toHaveProperty("role");
    }
  });
});

describe("other inputs", () => {
  it("cleans poll options", () => {
    expect(cleanPollOptions([" A ", "a", "", "B"])).toEqual(["A", "B"]);
  });
  it("validates comments", () => {
    expect(commentInputSchema.safeParse({ postId: "p1", content: "  " }).success).toBe(false);
    expect(commentInputSchema.safeParse({ postId: "p1", content: "a".repeat(2001) }).success).toBe(false);
    expect(commentInputSchema.safeParse({ postId: "p1", content: "ok", parentId: "" }).success).toBe(true);
  });
  it("validates groups", () => {
    expect(groupInputSchema.safeParse({ name: "ab", topic: "Physics", description: "A group for physics" }).success).toBe(false);
    expect(groupInputSchema.safeParse({ name: "Physics circle", topic: "Physics", description: "A group for physics" }).success).toBe(true);
  });
  it("only accepts the listed report reasons", () => {
    expect(reportInputSchema.safeParse({ targetType: "POST", targetId: "p1", reason: "because" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType: "POST", targetId: "p1", reason: "Spam or advertising" }).success).toBe(true);
    expect(reportInputSchema.safeParse({ targetType: "USER", targetId: "p1", reason: "Spam or advertising" }).success).toBe(false);
  });
});

describe("permissions", () => {
  const base = { viewerId: "me", viewerRole: "STUDENT", authorId: "other" };

  it("lets only the author edit", () => {
    expect(canEditContent("me", "me")).toBe(true);
    expect(canEditContent("me", "other")).toBe(false);
  });

  it("lets the author, site staff and the group's owner or moderator delete", () => {
    expect(canDeleteContent({ ...base, authorId: "me" })).toBe(true);
    expect(canDeleteContent(base)).toBe(false);
    expect(canDeleteContent({ ...base, viewerRole: "ADMIN" })).toBe(true);
    expect(canDeleteContent({ ...base, viewerRole: "TEACHER" })).toBe(false);
    expect(canDeleteContent({ ...base, inGroup: true, groupMembership: "MODERATOR" })).toBe(true);
    expect(canDeleteContent({ ...base, inGroup: true, groupMembership: "OWNER" })).toBe(true);
    expect(canDeleteContent({ ...base, inGroup: true, groupMembership: "MEMBER" })).toBe(false);
    // A moderator's power stops at their own group.
    expect(canDeleteContent({ ...base, inGroup: false, groupMembership: "MODERATOR" })).toBe(false);
  });

  it("keeps group management to the owner, and moderation to owner and moderators", () => {
    expect(canManageGroup({ viewerRole: "STUDENT", membership: "OWNER" })).toBe(true);
    expect(canManageGroup({ viewerRole: "STUDENT", membership: "MODERATOR" })).toBe(false);
    expect(canManageGroup({ viewerRole: "STUDENT", membership: null })).toBe(false);
    expect(canManageGroup({ viewerRole: "SUPER_ADMIN", membership: null })).toBe(true);
    expect(canModerateGroup({ viewerRole: "STUDENT", membership: "MODERATOR" })).toBe(true);
    expect(canModerateGroup({ viewerRole: "STUDENT", membership: "MEMBER" })).toBe(false);
  });

  it("hides a private profile's posts from people who don't follow it", () => {
    const p = { viewerId: "me", viewerRole: "STUDENT", ownerId: "other", ownerIsPrivate: true, viewerFollowsOwner: false };
    expect(canSeeProfilePosts(p)).toBe(false);
    expect(canSeeProfilePosts({ ...p, viewerFollowsOwner: true })).toBe(true);
    expect(canSeeProfilePosts({ ...p, ownerId: "me" })).toBe(true);
    expect(canSeeProfilePosts({ ...p, ownerIsPrivate: false })).toBe(true);
    expect(canSeeProfilePosts({ ...p, viewerRole: "ADMIN" })).toBe(true);
  });
});

describe("conversations", () => {
  it("gives both people the same ordered pair", () => {
    expect(conversationPair("b", "a")).toEqual({ userAId: "a", userBId: "b" });
    expect(conversationPair("a", "b")).toEqual(conversationPair("b", "a"));
    expect(() => conversationPair("a", "a")).toThrow();
  });
  it("knows who is in a conversation", () => {
    const c = { userAId: "a", userBId: "b" };
    expect(conversationSide(c, "a")).toBe("A");
    expect(conversationSide(c, "b")).toBe("B");
    expect(conversationSide(c, "c")).toBeNull();
  });
});

describe("cursor", () => {
  it("round-trips", () => {
    const item = { createdAt: new Date("2026-10-12T10:00:00.000Z"), id: "cmabc123def" };
    expect(decodeCursor(encodeCursor(item))).toEqual(item);
  });
  it("rejects junk instead of throwing", () => {
    for (const bad of [null, "", "nope", "2026-10-12T10:00:00.000Z_", "not-a-date_abc123", "2026-10-12T10:00:00.000Z_a b'--", "x".repeat(200)]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });
});

describe("text", () => {
  it("turns http(s) links into link parts and leaves everything else as text", () => {
    const parts = splitLinks("see https://example.com/a?b=1, and <script>alert(1)</script> javascript:alert(1)");
    expect(parts.filter((p) => p.type === "link")).toEqual([
      { type: "link", value: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
    ]);
    expect(parts.map((p) => p.value).join("")).toBe("see https://example.com/a?b=1, and <script>alert(1)</script> javascript:alert(1)");
  });
  it("returns plain text untouched", () => {
    expect(splitLinks("no links here")).toEqual([{ type: "text", value: "no links here" }]);
  });
  it("builds group slugs", () => {
    expect(groupSlug("HSC Physics — Study Circle!")).toBe("hsc-physics-study-circle");
    expect(groupSlug("পদার্থবিজ্ঞান")).toBe("group");
  });
  it("formats relative time", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(communityTimeAgo(new Date("2026-10-12T11:59:40Z"), now)).toBe("just now");
    expect(communityTimeAgo(new Date("2026-10-12T11:30:00Z"), now)).toBe("30m");
    expect(communityTimeAgo(new Date("2026-10-12T07:00:00Z"), now)).toBe("5h");
    expect(communityTimeAgo(new Date("2026-10-09T12:00:00Z"), now)).toBe("3d");
  });
});

describe("reaction summary", () => {
  it("reads like Facebook's line under a post", () => {
    expect(reactionSummary(3, null)).toBe("3");
    expect(reactionSummary(1, "LIKE")).toBe("You");
    expect(reactionSummary(2, "LOVE")).toBe("You and 1 other");
    expect(reactionSummary(5, "LIKE")).toBe("You and 4 others");
  });
});

describe("reel input", () => {
  const parse = (input: unknown) => postInputSchema.safeParse(input);
  it("needs a video stored on this site", () => {
    expect(parse({ kind: "REEL", content: "Tip" }).success).toBe(false);
    expect(parse({ kind: "REEL", content: "", videoUrl: "https://evil.example/v.mp4" }).success).toBe(false);
    expect(parse({ kind: "REEL", content: "", videoUrl: "/api/files/clx123abc456", videoDurationSec: 30 }).success).toBe(true);
  });
  it("caps the length", () => {
    expect(parse({ kind: "REEL", content: "", videoUrl: "/api/files/clx123abc456", videoDurationSec: 600 }).success).toBe(false);
  });
});

describe("group roles", () => {
  it("lets the owner and admins manage, and moderators moderate", async () => {
    const { canManageGroup, canModerateGroup } = await import("./rules");
    expect(canManageGroup({ viewerRole: "STUDENT", membership: "ADMIN" })).toBe(true);
    expect(canManageGroup({ viewerRole: "STUDENT", membership: "MODERATOR" })).toBe(false);
    expect(canModerateGroup({ viewerRole: "STUDENT", membership: "ADMIN" })).toBe(true);
    expect(canModerateGroup({ viewerRole: "STUDENT", membership: "MEMBER" })).toBe(false);
  });

  it("only the owner (or staff) appoints admins; admins appoint moderators", async () => {
    const { canSetGroupRole } = await import("./rules");
    expect(canSetGroupRole({ viewerRole: "STUDENT", actor: "OWNER", target: "MEMBER", to: "ADMIN" })).toBe(true);
    expect(canSetGroupRole({ viewerRole: "STUDENT", actor: "ADMIN", target: "MEMBER", to: "ADMIN" })).toBe(false);
    expect(canSetGroupRole({ viewerRole: "STUDENT", actor: "ADMIN", target: "MEMBER", to: "MODERATOR" })).toBe(true);
    expect(canSetGroupRole({ viewerRole: "STUDENT", actor: "ADMIN", target: "ADMIN", to: "MEMBER" })).toBe(false);
    expect(canSetGroupRole({ viewerRole: "STUDENT", actor: "MODERATOR", target: "MEMBER", to: "MODERATOR" })).toBe(false);
    expect(canSetGroupRole({ viewerRole: "ADMIN", actor: null, target: "OWNER", to: "MEMBER" })).toBe(false);
    expect(canSetGroupRole({ viewerRole: "ADMIN", actor: null, target: "MEMBER", to: "ADMIN" })).toBe(true);
  });

  it("removes only people ranked lower", async () => {
    const { canRemoveFromGroup } = await import("./rules");
    expect(canRemoveFromGroup({ viewerRole: "STUDENT", actor: "MODERATOR", target: "MEMBER" })).toBe(true);
    expect(canRemoveFromGroup({ viewerRole: "STUDENT", actor: "MODERATOR", target: "MODERATOR" })).toBe(false);
    expect(canRemoveFromGroup({ viewerRole: "STUDENT", actor: "ADMIN", target: "MODERATOR" })).toBe(true);
    expect(canRemoveFromGroup({ viewerRole: "STUDENT", actor: "OWNER", target: "ADMIN" })).toBe(true);
    expect(canRemoveFromGroup({ viewerRole: "STUDENT", actor: "MEMBER", target: "MEMBER" })).toBe(false);
    expect(canRemoveFromGroup({ viewerRole: "SUPER_ADMIN", actor: null, target: "OWNER" })).toBe(false);
  });

  it("keeps a private group's content for members and staff", async () => {
    const { canSeeGroupContent } = await import("./rules");
    expect(canSeeGroupContent({ viewerRole: "STUDENT", privacy: "PUBLIC", membership: null })).toBe(true);
    expect(canSeeGroupContent({ viewerRole: "STUDENT", privacy: "PRIVATE", membership: null })).toBe(false);
    expect(canSeeGroupContent({ viewerRole: "STUDENT", privacy: "PRIVATE", membership: "MEMBER" })).toBe(true);
    expect(canSeeGroupContent({ viewerRole: "ADMIN", privacy: "PRIVATE", membership: null })).toBe(true);
  });
});
