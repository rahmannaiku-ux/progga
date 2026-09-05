import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { getGoogleDocsAuthUrl, isGoogleDocsImportConfigured } from "@/lib/question-import/google-docs";

/**
 * Teacher-initiated, per-session OAuth (see google-docs.ts's header
 * comment for why this is architecturally separate from the admin
 * Drive-storage connection). `returnTo` round-trips through Google via
 * the `state` param so the callback lands back on the exact assessment
 * editor the teacher started from, not a generic page.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const user = await db.user.findUnique({ where: { clerkId }, select: { role: true, isActive: true } });
  if (!user?.isActive || !["TEACHER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.redirect(new URL("/dashboard?error=insufficient_permissions", req.url));
  }

  if (!isGoogleDocsImportConfigured()) {
    const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/mentor/dashboard";
    return NextResponse.redirect(
      new URL(`${returnTo}?docsError=${encodeURIComponent("Google Docs import isn't configured on this server yet.")}`, req.url)
    );
  }

  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/mentor/dashboard";
  const csrfToken = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ csrfToken, returnTo })).toString("base64url");

  const res = NextResponse.redirect(getGoogleDocsAuthUrl(state));
  res.cookies.set("gdocs_oauth_csrf", csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
