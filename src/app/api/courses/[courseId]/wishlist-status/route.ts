import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";

export async function GET(
  _req: Request,
  { params }: { params: { courseId: string } }
) {
  // Optional/anonymous-safe: no active/suspended check on this harmless
  // read endpoint, so getCurrentSessionUser (not the Active variant).
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ wishlisted: false });

  const entry = await db.wishlist.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: params.courseId } },
  });

  return NextResponse.json({ wishlisted: Boolean(entry) });
}
