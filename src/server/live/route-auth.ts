import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import type { Role } from "@prisma/client";

/**
 * Shared "who is calling this /api/live/** route" resolver, matching
 * the pattern every other API route in this codebase already uses
 * (Clerk `auth()` -> DB lookup -> active/suspended check) rather than
 * `getCurrentUser`/`requireRole`, which redirect and are meant for
 * server components/pages, not JSON API routes.
 */
export type LiveApiUser = { id: string; role: Role };

export type LiveApiAuthResult = { ok: true; user: LiveApiUser } | { ok: false; response: NextResponse };

export async function resolveLiveApiUser(): Promise<LiveApiAuthResult> {
  const { userId: clerkId } = auth();
  if (!clerkId) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, role: true, isActive: true, isSuspended: true },
  });
  if (!user || !user.isActive || user.isSuspended) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true, user: { id: user.id, role: user.role } };
}
