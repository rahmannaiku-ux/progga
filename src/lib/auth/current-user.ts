import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";

/**
 * Returns the current user's DB record. In the normal flow the Clerk
 * webhook (`/api/webhooks/clerk`) has already created this row. The
 * lazy-create fallback below only guards against the rare race where a
 * user hits a protected page before the webhook has landed (e.g. slow
 * webhook delivery) — it is not a substitute for the webhook.
 *
 * Uses upsert rather than create: in dev, React can render the same
 * server component twice concurrently, which can trigger two
 * simultaneous lazy-create attempts. With plain `create`, the second
 * one crashes on a unique constraint violation. `upsert` makes this
 * idempotent — if the row already exists (from the other concurrent
 * call, the webhook, or a previous visit), it's simply returned instead
 * of erroring.
 *
 * Wrapped in React's `cache()`: this is called once by `(hero)/layout.tsx`
 * to gate the route and again by every page underneath it to get the
 * user object — previously two separate DB round trips (or, on the
 * lazy-create path, two separate create attempts) per request for the
 * same row. `cache()` takes no arguments here, so every call within one
 * render pass shares the same memoized result — identical behavior,
 * one less query.
 */
export const getCurrentUser = cache(async () => {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  let user = await db.user.findUnique({ where: { clerkId: userId! } });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) redirect("/sign-in");

    const email = clerkUser!.emailAddresses.find(
      (e) => e.id === clerkUser!.primaryEmailAddressId
    )?.emailAddress;

    if (!email) redirect("/sign-in?error=no_email");

    try {
      user = await db.user.create({
        data: {
          clerkId: userId!,
          email: email!,
          firstName: clerkUser!.firstName ?? "",
          lastName: clerkUser!.lastName ?? "",
          avatarUrl: clerkUser!.imageUrl,
          role: "STUDENT",
          studentProfile: { create: {} },
          heroStats: { create: {} },
        },
      });
    } catch (err) {
      // P2002 = unique constraint violation. Because this create has
      // nested relations (studentProfile, heroStats), Prisma can't use
      // an atomic "insert-or-update" here, so two near-simultaneous
      // requests (e.g. layout + page rendering in parallel on first
      // dashboard load) can both see "no user yet" and both try to
      // create the row. Whichever loses the race just re-fetches the
      // row the winner already created, instead of erroring out.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2002"
      ) {
        user = await db.user.findUnique({ where: { clerkId: userId! } });
      } else {
        throw err;
      }
    }

    if (!user) redirect("/sign-in?error=account_setup_failed");
  }

  if (!user.isActive || user.isSuspended) {
    redirect("/sign-in?error=account_inactive");
  }

  return user;
});

/**
 * Non-redirecting counterpart to `getCurrentUser`, for optional/public
 * contexts (e.g. the marketing site header) that need to know "is this
 * visitor signed in, and if so what role are they" without forcing an
 * anonymous visitor through sign-in or bouncing a suspended user off a
 * public page just because a nav link tried to resolve their role.
 * Returns `null` for anyone not signed in or not (yet) provisioned in
 * the DB — callers should fall back to logged-out UI in that case, the
 * same way `isMaintenanceBlocking` treats "no row yet" as non-admin.
 * Deliberately does no lazy user creation and never redirects.
 *
 * Wrapped in `cache()` for the same reason as the other helpers here:
 * the header and any other server component reading it within one
 * request share a single lookup.
 */
export const getCurrentUserRoleOptional = cache(async () => {
  const { userId } = auth();
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    select: { role: true, isActive: true, isSuspended: true },
  });

  if (!user || !user.isActive || user.isSuspended) return null;

  return user.role;
});
