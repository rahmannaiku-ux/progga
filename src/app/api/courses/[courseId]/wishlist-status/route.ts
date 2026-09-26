import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";

export async function GET(
  _req: Request,
  { params }: { params: { courseId: string } }
) {
  // PHASE 5: migrated off Clerk. Optional/anonymous-safe, same as
  // before — no active/suspended check here either originally, so
  // getCurrentSessionUser (not the Active variant) preserves that
  // exactly rather than silently tightening a harmless read endpoint.
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ wishlisted: false });

  const entry = await db.wishlist.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: params.courseId } },
  });

  return NextResponse.json({ wishlisted: Boolean(entry) });
}
