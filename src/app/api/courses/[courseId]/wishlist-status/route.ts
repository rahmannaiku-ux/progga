import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";

export async function GET(
  _req: Request,
  { params }: { params: { courseId: string } }
) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.json({ wishlisted: false });

  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) return NextResponse.json({ wishlisted: false });

  const entry = await db.wishlist.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: params.courseId } },
  });

  return NextResponse.json({ wishlisted: Boolean(entry) });
}
