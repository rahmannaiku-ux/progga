import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getGoogleAuthUrl } from "@/lib/storage/google-drive";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";

/**
 * Admin → Storage → "Connect Google Drive" hits this route, which
 * redirects to Google's consent screen. Admin-only (storage spec §21) —
 * students must never see or reach this endpoint.
 *
 * PHASE 5: migrated off Clerk.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentActiveSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
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
