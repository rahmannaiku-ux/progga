import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { exchangeGoogleDocsCode } from "@/lib/question-import/google-docs";
import { encryptSecret } from "@/lib/storage/token-crypto";

export async function GET(req: NextRequest) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const user = await db.user.findUnique({ where: { clerkId }, select: { isActive: true, role: true } });
  if (!user?.isActive || !["TEACHER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.redirect(new URL("/dashboard?error=insufficient_permissions", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const csrfCookie = req.cookies.get("gdocs_oauth_csrf")?.value;

  let returnTo = "/mentor/dashboard";
  let csrfToken: string | undefined;
  try {
    if (stateRaw) {
      const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
      returnTo = parsed.returnTo ?? returnTo;
      csrfToken = parsed.csrfToken;
    }
  } catch {
    // malformed state — fall through to the generic failure redirect below
  }

  const fail = (message: string) =>
    NextResponse.redirect(new URL(`${returnTo}?docsError=${encodeURIComponent(message)}`, req.url));

  if (error) return fail(error === "access_denied" ? "Google Docs connection cancelled." : error);
  if (!code) return fail("Google didn't return an authorization code.");
  if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
    return fail("Could not verify the request — please try connecting again.");
  }

  try {
    const { accessToken, expiresAt } = await exchangeGoogleDocsCode(code);
    const maxAgeSeconds = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));

    const res = NextResponse.redirect(new URL(`${returnTo}?docsConnected=1`, req.url));
    res.cookies.set("gdocs_access_token", encryptSecret(accessToken), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: maxAgeSeconds,
      path: "/",
    });
    res.cookies.delete("gdocs_oauth_csrf");
    return res;
  } catch (err) {
    console.error("Google Docs OAuth exchange failed:", err);
    return fail(err instanceof Error ? err.message : "Connection failed.");
  }
}
