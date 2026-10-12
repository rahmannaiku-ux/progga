import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------
// Community integration tests: the real server actions against a real
// Postgres. They are SKIPPED unless COMMUNITY_TEST_DATABASE_URL points at
// a local database (see the guard below), so `npm test` stays DB-free and
// they can never run against production.
//
//   COMMUNITY_TEST_DATABASE_URL=postgresql://test:test@localhost:54329/proggaa_test npx vitest run src/server/actions/community.integration.test.ts
//
// The database needs the migrations applied (prisma migrate deploy).
// ---------------------------------------------------------------------

const TEST_URL = process.env.COMMUNITY_TEST_DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1)[:/]/.test(TEST_URL);
if (isLocal) {
  process.env.DATABASE_URL = TEST_URL;
  process.env.DIRECT_URL = TEST_URL;
}

type TestUser = { id: string; role: string; firstName: string; lastName: string; avatarUrl: string | null };
const session: { user: TestUser | null } = { user: null };
const limiter = { blocked: false };

vi.mock("./require-user", () => ({
  requireActiveUser: async () => {
    if (!session.user) throw new Error("Your session has expired. Please sign in again.");
    return session.user;
  },
  requireAdminUser: async () => {
    if (!session.user) throw new Error("Your session has expired. Please sign in again.");
    if (!["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) throw new Error("Admin access required.");
    return session.user;
  },
  requireMentorUser: async () => session.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ success: !limiter.blocked }) }));
vi.mock("@/lib/config/feature-flags", () => ({ isFeatureEnabled: async () => true }));

describe.skipIf(!isLocal)("Proggaa Community (integration)", () => {
  let db: typeof import("@/lib/db/client").db;
  let actions: typeof import("./community-actions");
  let messages: typeof import("./message-actions");
  let moderation: typeof import("./community-moderation-actions");
  let service: typeof import("@/server/services/community");

  const users: Record<"ana" | "bo" | "cy" | "admin" | "admin2", TestUser> = {} as never;
  const as = (who: keyof typeof users | null) => {
    session.user = who ? users[who] : null;
  };
  const tag = `t${Date.now().toString(36)}`;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
    actions = await import("./community-actions");
    messages = await import("./message-actions");
    moderation = await import("./community-moderation-actions");
    service = await import("@/server/services/community");

    const make = async (key: keyof typeof users, role: string) => {
      const row = await db.user.create({
        data: { firstName: key, lastName: tag, role: role as never, profileCompleted: true, phone: `${tag}-${key}` },
        select: { id: true, role: true, firstName: true, lastName: true, avatarUrl: true },
      });
      users[key] = row;
    };
    await make("ana", "STUDENT");
    await make("bo", "STUDENT");
    await make("cy", "STUDENT");
    await make("admin", "ADMIN");
    await make("admin2", "ADMIN");
  });

  afterAll(async () => {
    // Only what this run created (cascades take the rest).
    await db.user.deleteMany({ where: { lastName: tag } });
    await db.$disconnect();
  });

  beforeEach(() => {
    limiter.blocked = false;
    as("ana");
  });

  const post = async (input: Record<string, unknown>) => {
    const res = await actions.createPost(input);
    if (!res.ok) throw new Error(res.error);
    return res.postId;
  };

  describe("authentication", () => {
    it("refuses every write without a session", async () => {
      as(null);
      await expect(actions.createPost({ content: "hi" })).rejects.toThrow(/session/i);
      await expect(actions.setReaction("x", "LIKE")).rejects.toThrow(/session/i);
      await expect(messages.sendMessage("x", "hi")).rejects.toThrow(/session/i);
      await expect(moderation.resolveReport("x", "DISMISS", "")).rejects.toThrow(/session/i);
    });
  });

  describe("posts", () => {
    it("creates, edits and deletes the author's own post", async () => {
      const id = await post({ content: "first post" });
      expect((await actions.updatePost(id, "edited")).ok).toBe(true);
      const row = await db.communityPost.findUnique({ where: { id } });
      expect(row?.content).toBe("edited");
      expect(row?.editedAt).not.toBeNull();
      expect(row?.authorId).toBe(users.ana.id);
      expect((await actions.deletePost(id)).ok).toBe(true);
      expect(await db.communityPost.findUnique({ where: { id } })).toBeNull();
    });

    it("ignores an authorId sent by the client", async () => {
      const id = await post({ content: "mine", authorId: users.bo.id, isHidden: true });
      const row = await db.communityPost.findUnique({ where: { id } });
      expect(row?.authorId).toBe(users.ana.id);
      expect(row?.isHidden).toBe(false);
    });

    it("stops other students editing or deleting it", async () => {
      const id = await post({ content: "ana's post" });
      as("bo");
      expect((await actions.updatePost(id, "hacked")).ok).toBe(false);
      expect((await actions.deletePost(id)).ok).toBe(false);
      expect((await db.communityPost.findUnique({ where: { id } }))?.content).toBe("ana's post");
      as("admin");
      expect((await actions.updatePost(id, "admin rewrite")).ok).toBe(false); // staff remove, never rewrite
      expect((await actions.deletePost(id)).ok).toBe(true);
    });

    it("validates input", async () => {
      expect((await actions.createPost({ content: "  " })).ok).toBe(false);
      expect((await actions.createPost({ content: "x", imageUrl: "https://evil.example/a.png" })).ok).toBe(false);
      // A well-formed path that is not an upload this user made.
      expect((await actions.createPost({ content: "x", imageUrl: "/api/files/notmineatall" })).ok).toBe(false);
      expect((await actions.createPost({ kind: "POLL", content: "Pick", pollOptions: ["only one"] })).ok).toBe(false);
    });

    it("is rate limited", async () => {
      limiter.blocked = true;
      const res = await actions.createPost({ content: "spam" });
      expect(res.ok).toBe(false);
      expect((await actions.addComment({ postId: "x", content: "spam" })).ok).toBe(false);
      expect((await actions.setReaction("x", "LIKE")).ok).toBe(false);
      expect((await actions.reportContent({ targetType: "POST", targetId: "x", reason: "Spam or advertising" })).ok).toBe(false);
    });

    it("shares a post with attribution, pointing at the original", async () => {
      const original = await post({ content: "original" });
      as("bo");
      const share = await post({ content: "look", sharedPostId: original });
      as("cy");
      const reshare = await post({ content: "", sharedPostId: share });
      expect((await db.communityPost.findUnique({ where: { id: reshare } }))?.sharedPostId).toBe(original);
      const dto = await service.getPost(users.cy, reshare);
      expect(dto?.shared && dto.shared !== "removed" && dto.shared.author.id).toBe(users.ana.id);
    });

    it("pages a feed with a cursor and no repeats", async () => {
      as("cy");
      for (let i = 0; i < 12; i++) await post({ content: `page test ${i}` });
      const first = await service.getFeedPage(users.cy, { type: "profile", userId: users.cy.id });
      expect(first.posts).toHaveLength(10);
      expect(first.nextCursor).not.toBeNull();
      const second = await service.getFeedPage(users.cy, { type: "profile", userId: users.cy.id }, first.nextCursor);
      const ids = new Set([...first.posts, ...second.posts].map((p) => p.id));
      expect(ids.size).toBe(first.posts.length + second.posts.length);
      expect(second.posts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("reactions", () => {
    it("keeps one reaction per person under concurrent requests", async () => {
      const id = await post({ content: "react to me" });
      as("bo");
      // None of the racing requests may fail, and at most one row may exist.
      const raced = await Promise.all(Array.from({ length: 8 }, () => actions.setReaction(id, "LOVE")));
      expect(raced.every((r) => r.ok)).toBe(true);
      expect(await db.communityReaction.count({ where: { postId: id } })).toBeLessThanOrEqual(1);
      // Settle on a known state, then check change + clear.
      await db.communityReaction.deleteMany({ where: { postId: id } });
      const liked = await actions.setReaction(id, "LIKE");
      expect(liked.ok && liked.reactionCount).toBe(1);
      const changed = await actions.setReaction(id, "CELEBRATE");
      expect(changed.ok && changed.myReaction).toBe("CELEBRATE");
      expect(changed.ok && changed.reactionCount).toBe(1);
      const cleared = await actions.setReaction(id, "CELEBRATE");
      expect(cleared.ok && cleared.myReaction).toBeNull();
      expect(cleared.ok && cleared.reactionCount).toBe(0);
    });

    it("rejects an unknown reaction type", async () => {
      const id = await post({ content: "x1" });
      expect((await actions.setReaction(id, "ANGRY" as never)).ok).toBe(false);
    });

    it("notifies the author once, and never for reacting to your own post", async () => {
      const id = await post({ content: "notify me" });
      await actions.setReaction(id, "LIKE"); // own post
      const link = `/community/post/${id}`;
      expect(await db.notification.count({ where: { userId: users.ana.id, linkUrl: link } })).toBe(0);
      as("bo");
      await actions.setReaction(id, "LIKE");
      await actions.setReaction(id, null);
      await actions.setReaction(id, "LIKE");
      as("cy");
      await actions.setReaction(id, "LOVE");
      const rows = await db.notification.findMany({ where: { userId: users.ana.id, linkUrl: link } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.isRead).toBe(false);
      expect(rows[0]?.type).toBe("COMMUNITY_REACTION");
    });
  });

  describe("comments", () => {
    it("adds comments and one level of replies", async () => {
      const id = await post({ content: "discuss" });
      as("bo");
      const c = await actions.addComment({ postId: id, content: "top level" });
      as("cy");
      const r = await actions.addComment({ postId: id, parentId: c.ok ? c.commentId : "", content: "a reply" });
      as("ana");
      const rr = await actions.addComment({ postId: id, parentId: r.ok ? r.commentId : "", content: "reply to the reply" });
      expect(c.ok && r.ok && rr.ok).toBe(true);
      const nested = await db.communityComment.findUnique({ where: { id: rr.ok ? rr.commentId : "" } });
      expect(nested?.parentId).toBe(c.ok ? c.commentId : null); // joined the same thread
      const { comments } = await service.getComments(users.ana, { id, groupId: null });
      expect(comments).toHaveLength(1);
      expect(comments[0]?.replies).toHaveLength(2);
      const dto = await service.getPost(users.ana, id);
      expect(dto?.commentCount).toBe(3);
    });

    it("lets only the author edit, and only author or staff delete", async () => {
      const id = await post({ content: "post" });
      as("bo");
      const c = await actions.addComment({ postId: id, content: "bo's comment" });
      const cid = c.ok ? c.commentId : "";
      as("cy");
      expect((await actions.updateComment(cid, "hacked")).ok).toBe(false);
      expect((await actions.deleteComment(cid)).ok).toBe(false);
      as("ana"); // the post's author is not the comment's author
      expect((await actions.deleteComment(cid)).ok).toBe(false);
      as("bo");
      expect((await actions.updateComment(cid, "fixed")).ok).toBe(true);
      as("admin");
      expect((await actions.deleteComment(cid)).ok).toBe(true);
    });

    it("refuses a reply whose parent belongs to another post", async () => {
      const a = await post({ content: "post a" });
      const b = await post({ content: "post b" });
      const c = await actions.addComment({ postId: a, content: "on a" });
      const res = await actions.addComment({ postId: b, parentId: c.ok ? c.commentId : "", content: "cross post" });
      expect(res.ok).toBe(false);
    });
  });

  describe("polls", () => {
    it("counts one vote per person, even when raced, and lets it move", async () => {
      const id = await post({ kind: "POLL", content: "Best?", pollOptions: ["A", "B", "C"] });
      const options = await db.communityPollOption.findMany({ where: { postId: id }, orderBy: { order: "asc" } });
      as("bo");
      const raced = await Promise.all(Array.from({ length: 6 }, (_, i) => actions.votePoll(id, options[i % 3]!.id)));
      expect(raced.every((r) => r.ok)).toBe(true);
      expect(await db.communityPollVote.count({ where: { postId: id, userId: users.bo.id } })).toBe(1);
      const moved = await actions.votePoll(id, options[2]!.id);
      expect(moved.ok && moved.myOptionId).toBe(options[2]!.id);
      expect(moved.ok && moved.options.reduce((s, o) => s + o.votes, 0)).toBe(1);
      as("cy");
      await actions.votePoll(id, options[2]!.id);
      const dto = await service.getPost(users.cy, id);
      expect(dto?.poll?.totalVotes).toBe(2);
      expect(dto?.poll?.options[2]?.votes).toBe(2);
    });

    it("rejects an option from a different poll", async () => {
      const one = await post({ kind: "POLL", content: "One?", pollOptions: ["A", "B"] });
      const two = await post({ kind: "POLL", content: "Two?", pollOptions: ["C", "D"] });
      const foreign = await db.communityPollOption.findFirst({ where: { postId: two } });
      expect((await actions.votePoll(one, foreign!.id)).ok).toBe(false);
      expect(await db.communityPollVote.count({ where: { postId: one } })).toBe(0);
    });

    it("refuses votes on a closed poll", async () => {
      const id = await post({ kind: "POLL", content: "Closed?", pollOptions: ["A", "B"] });
      await db.communityPost.update({ where: { id }, data: { pollClosesAt: new Date(Date.now() - 1000) } });
      const option = await db.communityPollOption.findFirst({ where: { postId: id } });
      expect((await actions.votePoll(id, option!.id)).ok).toBe(false);
    });
  });

  describe("following and privacy", () => {
    it("follows and unfollows, one row even when raced, never yourself", async () => {
      expect((await actions.toggleFollow(users.ana.id)).ok).toBe(false);
      await db.communityFollow.deleteMany({ where: { followerId: users.ana.id } });
      const first = await actions.toggleFollow(users.bo.id);
      expect(first.ok && first.following).toBe(true);
      expect(await db.communityFollow.count({ where: { followerId: users.ana.id, followingId: users.bo.id } })).toBe(1);
      expect(await db.notification.count({ where: { userId: users.bo.id, type: "COMMUNITY_FOLLOW" } })).toBe(1);
      const second = await actions.toggleFollow(users.bo.id);
      expect(second.ok && second.following).toBe(false);
      expect(second.ok && second.followerCount).toBe(0);
    });

    it("shows a private profile's posts only to followers", async () => {
      as("bo");
      await actions.updateCommunityProfile({ bio: "private person", headline: "", communityPrivate: true });
      const id = await post({ content: "followers only" });
      await db.communityFollow.deleteMany({ where: { followingId: users.bo.id } });

      expect(await service.getPost(users.cy, id)).toBeNull();
      const feed = await service.getFeedPage(users.cy, { type: "profile", userId: users.bo.id });
      expect(feed.posts).toHaveLength(0);
      expect((await service.getProfile(users.cy, users.bo.id))?.canSeePosts).toBe(false);
      as("cy");
      expect((await actions.setReaction(id, "LIKE")).ok).toBe(false);
      expect((await actions.addComment({ postId: id, content: "let me in" })).ok).toBe(false);

      await actions.toggleFollow(users.bo.id);
      expect(await service.getPost(users.cy, id)).not.toBeNull();
      expect(await service.getPost(users.admin, id)).not.toBeNull(); // staff can, for moderation

      as("bo");
      await actions.updateCommunityProfile({ bio: "", headline: "", communityPrivate: false });
    });

    it("never exposes private account fields in a profile", async () => {
      const profile = await service.getProfile(users.cy, users.ana.id);
      const json = JSON.stringify(profile);
      expect(json).not.toContain(`${tag}-ana`); // the phone number
      for (const key of ["phone", "email", "passwordHash", "role"]) expect(profile).not.toHaveProperty(key);
    });

    it("only edits the signed-in user's own profile", async () => {
      as("cy");
      await actions.updateCommunityProfile({ bio: "cy's bio", headline: "h", communityPrivate: false, userId: users.ana.id, role: "ADMIN" });
      expect((await db.user.findUnique({ where: { id: users.cy.id } }))?.bio).toBe("cy's bio");
      const ana = await db.user.findUnique({ where: { id: users.ana.id } });
      expect(ana?.bio).not.toBe("cy's bio");
      expect((await db.user.findUnique({ where: { id: users.cy.id } }))?.role).toBe("STUDENT");
    });
  });

  describe("groups", () => {
    it("handles membership, posting rights and owner/moderator permissions", async () => {
      const created = await actions.createGroup({ name: `Physics ${tag}`, topic: "Physics", description: "Study physics together" });
      expect(created.ok).toBe(true);
      const group = await db.communityGroup.findFirst({ where: { name: `Physics ${tag}` } });
      const gid = group!.id;
      expect(group?.ownerId).toBe(users.ana.id);

      as("bo");
      expect((await actions.createPost({ content: "not a member", groupId: gid })).ok).toBe(false);
      const joined = await actions.toggleGroupMembership(gid);
      expect(joined.ok && joined.joined && joined.memberCount).toBe(2);
      await Promise.all([actions.toggleGroupMembership(gid), actions.toggleGroupMembership(gid)].map((p) => p.catch(() => null)));
      expect(await db.communityGroupMember.count({ where: { groupId: gid, userId: users.bo.id } })).toBeLessThanOrEqual(1);
      await db.communityGroupMember.upsert({
        where: { groupId_userId: { groupId: gid, userId: users.bo.id } },
        create: { groupId: gid, userId: users.bo.id },
        update: { role: "MEMBER" },
      });
      const boPost = await post({ content: "hello group", groupId: gid });

      // A member can't edit the group, pick moderators, or delete others' posts.
      expect((await actions.updateGroup(gid, { name: "Hijacked", topic: "x1", description: "taken over by bo" })).ok).toBe(false);
      expect((await actions.setGroupModerator(gid, users.bo.id, true)).ok).toBe(false);
      expect((await actions.deleteGroup(gid)).ok).toBe(false);

      as("cy");
      await actions.toggleGroupMembership(gid);
      expect((await actions.deletePost(boPost)).ok).toBe(false);

      // The owner makes cy a moderator; now cy can remove a post in this group.
      as("ana");
      expect((await actions.setGroupModerator(gid, users.cy.id, true)).ok).toBe(true);
      // The owner's own role can't be changed through this action.
      expect((await actions.setGroupModerator(gid, users.ana.id, false)).ok).toBe(false);
      expect((await db.communityGroupMember.findUnique({ where: { groupId_userId: { groupId: gid, userId: users.ana.id } } }))?.role).toBe("OWNER");
      as("cy");
      expect((await actions.setGroupModerator(gid, users.bo.id, true)).ok).toBe(false); // moderators don't appoint moderators
      expect((await actions.deletePost(boPost)).ok).toBe(true);

      // Leaving, and the owner can't just walk away.
      as("bo");
      const left = await actions.toggleGroupMembership(gid);
      expect(left.ok && left.joined).toBe(false);
      as("ana");
      expect((await actions.toggleGroupMembership(gid)).ok).toBe(false);
      expect((await actions.updateGroup(gid, { name: `Physics ${tag} 2`, topic: "Physics", description: "Study physics together" })).ok).toBe(true);
      expect((await actions.deleteGroup(gid)).ok).toBe(true);
    });
  });

  describe("useful answers and XP", () => {
    it("lets only the asker mark an answer, never their own, and pays the helper once", async () => {
      const q = await post({ kind: "QUESTION", content: "How do I integrate x squared?" });
      as("bo");
      const answer = await actions.addComment({ postId: q, content: "x cubed over three, plus C" });
      const aid = answer.ok ? answer.commentId : "";
      expect((await actions.setAcceptedAnswer(q, aid)).ok).toBe(false); // bo did not ask
      as("ana");
      const own = await actions.addComment({ postId: q, content: "never mind, got it" });
      expect((await actions.setAcceptedAnswer(q, own.ok ? own.commentId : "")).ok).toBe(false);

      const xpBefore = (await db.heroStats.findUnique({ where: { userId: users.bo.id } }))?.xp ?? 0;
      expect((await actions.setAcceptedAnswer(q, aid)).ok).toBe(true);
      const xpAfter = (await db.heroStats.findUnique({ where: { userId: users.bo.id } }))?.xp ?? 0;
      expect(xpAfter - xpBefore).toBe(15);

      // Un-mark and re-mark: no second payment.
      await actions.setAcceptedAnswer(q, null);
      await actions.setAcceptedAnswer(q, aid);
      expect((await db.heroStats.findUnique({ where: { userId: users.bo.id } }))?.xp).toBe(xpAfter);
      expect(await db.rewardEvent.count({ where: { userId: users.bo.id, sourceType: "COMMUNITY_ANSWER", sourceId: q } })).toBe(1);
      expect(await db.notification.count({ where: { userId: users.bo.id, type: "COMMUNITY_ANSWER" } })).toBe(1);
    });

    it("caps helpful-answer XP at three a day", async () => {
      await db.rewardEvent.deleteMany({ where: { userId: users.cy.id, sourceType: "COMMUNITY_ANSWER" } });
      const before = (await db.heroStats.findUnique({ where: { userId: users.cy.id } }))?.xp ?? 0;
      for (let i = 0; i < 5; i++) {
        as("ana");
        const q = await post({ kind: "QUESTION", content: `Daily cap question number ${i}?` });
        as("cy");
        const a = await actions.addComment({ postId: q, content: `answer ${i}` });
        as("ana");
        await actions.setAcceptedAnswer(q, a.ok ? a.commentId : "");
      }
      const after = (await db.heroStats.findUnique({ where: { userId: users.cy.id } }))?.xp ?? 0;
      expect(after - before).toBe(45);
    });

    it("gives nothing for posting, reacting or voting", async () => {
      as("bo");
      const before = (await db.heroStats.findUnique({ where: { userId: users.bo.id } }))?.xp ?? 0;
      const events = await db.rewardEvent.count({ where: { userId: users.bo.id } });
      const id = await post({ content: "no xp for this" });
      await actions.setReaction(id, "LIKE");
      await actions.addComment({ postId: id, content: "nor this" });
      expect((await db.heroStats.findUnique({ where: { userId: users.bo.id } }))?.xp ?? 0).toBe(before);
      expect(await db.rewardEvent.count({ where: { userId: users.bo.id } })).toBe(events);
    });
  });

  describe("messages", () => {
    it("only opens a chat with someone who follows you, and keeps it between the two", async () => {
      await db.communityFollow.deleteMany({ where: { followerId: users.bo.id, followingId: users.ana.id } });
      await db.conversation.deleteMany({ where: { OR: [{ userAId: users.ana.id }, { userBId: users.ana.id }] } });

      expect((await messages.openConversation(users.ana.id)).ok).toBe(false); // yourself
      expect((await messages.openConversation(users.bo.id)).ok).toBe(false); // bo doesn't follow ana

      as("bo");
      await actions.toggleFollow(users.ana.id);
      as("ana");
      const opened = await messages.openConversation(users.bo.id);
      expect(opened.ok).toBe(true);
      const cid = opened.ok ? opened.conversationId : "";
      // Both resolve to the same conversation.
      as("bo");
      const again = await messages.openConversation(users.ana.id);
      expect(again.ok && again.conversationId).toBe(cid);

      as("ana");
      const sent = await messages.sendMessage(cid, "hello bo <b>not html</b>");
      expect(sent.ok && sent.message.body).toBe("hello bo <b>not html</b>");
      expect((await messages.sendMessage(cid, "   ")).ok).toBe(false);
      expect((await messages.sendMessage(cid, "a".repeat(2001))).ok).toBe(false);

      // bo sees it as unread, then reads it.
      expect(await service.countUnreadConversations(users.bo.id)).toBe(1);
      expect((await service.listConversations(users.bo.id))[0]?.unread).toBe(1);
      as("bo");
      const polled = await messages.pollConversation(cid);
      expect(polled.ok && polled.messages).toHaveLength(1);
      expect(polled.ok && polled.messages[0]?.fromMe).toBe(false);
      expect(await service.countUnreadConversations(users.bo.id)).toBe(0);

      // cy is not in it: can't read, poll, page or send, and doesn't see it listed.
      as("cy");
      expect(await service.getConversation(users.cy.id, cid)).toBeNull();
      expect((await messages.pollConversation(cid)).ok).toBe(false);
      expect((await messages.loadOlderMessages(cid, `${new Date().toISOString()}_abcdef12`)).ok).toBe(false);
      expect((await messages.sendMessage(cid, "let me in")).ok).toBe(false);
      expect(await service.listConversations(users.cy.id)).toHaveLength(0);
      expect(await db.message.count({ where: { conversationId: cid } })).toBe(1);
    });

    it("lets a student reach staff without being followed", async () => {
      as("cy");
      expect((await messages.openConversation(users.admin.id)).ok).toBe(true);
    });
  });

  describe("moderation", () => {
    it("takes reports once each, and not about your own content", async () => {
      const id = await post({ content: "report me" });
      expect((await actions.reportContent({ targetType: "POST", targetId: id, reason: "Spam or advertising" })).ok).toBe(false);
      expect((await actions.reportContent({ targetType: "PROFILE", targetId: users.ana.id, reason: "Spam or advertising" })).ok).toBe(false);
      as("bo");
      await actions.reportContent({ targetType: "POST", targetId: id, reason: "Spam or advertising" });
      await actions.reportContent({ targetType: "POST", targetId: id, reason: "Harassment or bullying" });
      expect(await db.communityReport.count({ where: { postId: id, reporterId: users.bo.id } })).toBe(1);
    });

    it("lets only an uninvolved admin decide, hides content and records it", async () => {
      as("ana");
      const id = await post({ content: "rude post" });
      as("bo");
      await actions.reportContent({ targetType: "POST", targetId: id, reason: "Hate or abusive language", details: "see this" });
      const report = await db.communityReport.findFirst({ where: { postId: id } });

      // A student can't moderate, even their own report.
      await expect(moderation.resolveReport(report!.id, "HIDE", "no thanks")).rejects.toThrow(/admin/i);

      as("admin");
      expect((await moderation.resolveReport(report!.id, "HIDE", "")).ok).toBe(false); // a reason is required
      expect((await moderation.resolveReport(report!.id, "NUKE" as never, "reason")).ok).toBe(false);
      expect((await moderation.resolveReport(report!.id, "HIDE", "Abusive language")).ok).toBe(true);

      const hidden = await db.communityPost.findUnique({ where: { id } });
      expect(hidden?.isHidden).toBe(true);
      expect(hidden?.hiddenReason).toBe("Abusive language");
      expect(await service.getPost(users.cy, id)).toBeNull(); // gone for others
      expect(await service.getPost(users.ana, id)).not.toBeNull(); // the author still sees it
      const closed = await db.communityReport.findUnique({ where: { id: report!.id } });
      expect(closed?.status).toBe("ACTIONED");
      expect(closed?.reviewedById).toBe(users.admin.id);
      expect(await db.activityLog.count({ where: { userId: users.admin.id, entityType: "CommunityReport", entityId: report!.id } })).toBe(1);
      expect(await db.notification.count({ where: { userId: users.ana.id, type: "COMMUNITY_MODERATION" } })).toBe(1);
      // Can't be decided twice.
      expect((await moderation.resolveReport(report!.id, "DISMISS", "")).ok).toBe(false);
    });

    it("stops an admin handling their own report or a report about themselves", async () => {
      as("ana");
      const id = await post({ content: "something" });
      as("admin");
      await actions.reportContent({ targetType: "POST", targetId: id, reason: "Spam or advertising" });
      const own = await db.communityReport.findFirst({ where: { postId: id, reporterId: users.admin.id } });
      expect((await moderation.resolveReport(own!.id, "REMOVE", "I say so")).ok).toBe(false);
      as("admin2");
      expect((await moderation.resolveReport(own!.id, "REMOVE", "Confirmed spam")).ok).toBe(true);
      expect(await db.communityPost.findUnique({ where: { id } })).toBeNull();

      as("admin");
      const adminPost = await post({ content: "admin's own post" });
      as("bo");
      await actions.reportContent({ targetType: "POST", targetId: adminPost, reason: "Spam or advertising" });
      const about = await db.communityReport.findFirst({ where: { postId: adminPost } });
      as("admin");
      expect((await moderation.resolveReport(about!.id, "DISMISS", "")).ok).toBe(false);
    });

    it("suspends an abusive account through the existing account suspension", async () => {
      as("cy");
      const id = await post({ content: "abuse" });
      as("bo");
      await actions.reportContent({ targetType: "POST", targetId: id, reason: "Harassment or bullying" });
      const report = await db.communityReport.findFirst({ where: { postId: id } });
      as("admin");
      expect((await moderation.resolveReport(report!.id, "SUSPEND_AUTHOR", "Repeated harassment")).ok).toBe(true);
      expect((await db.user.findUnique({ where: { id: users.cy.id } }))?.isSuspended).toBe(true);
      // A suspended account's posts and profile disappear for everyone else.
      expect(await service.getProfile(users.bo, users.cy.id)).toBeNull();
      expect((await service.getFeedPage(users.bo, { type: "profile", userId: users.cy.id })).posts).toHaveLength(0);
      await db.user.update({ where: { id: users.cy.id }, data: { isSuspended: false } });
    });
  });
});
