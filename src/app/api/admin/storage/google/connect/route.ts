import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { getGoogleAuthUrl } from "@/lib/storage/google-drive";

/**
 * Admin → Storage → "Connect Google Drive" hits this route, which
 * redirects to Google's consent screen. Admin-only (storage spec §21) —
 * students must never see or reach this endpoint.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const user = await db.user.findUnique({ where: { clerkId }, select: { role: true, isActive: true } });
  if (!user?.isActive || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return NextResponse.redirect(new URL("/dashboard?error=insufficient_permissions", req.url));
  }

  // A random state value is round-tripped through Google and checked in
  // the callback — standard CSRF protection for OAuth redirects, so a
  // malicious site can't trick an admin's browser into completing a
  // Drive connection the admin never initiated.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(getGoogleAuthUrl(state));
  res.cookies.set("gdrive_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
