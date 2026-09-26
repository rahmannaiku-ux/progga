import { NextRequest, NextResponse } from "next/server";
import { connectGoogleDriveAccount } from "@/lib/storage/google-drive";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";

export async function GET(req: NextRequest) {
  // PHASE 5: migrated off Clerk.
  const user = await getCurrentActiveSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard?error=insufficient_permissions", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get("gdrive_oauth_state")?.value;
  const error = url.searchParams.get("error");

  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/admin/storage?error=${encodeURIComponent(message)}`, req.url));

  if (error) return fail(error === "access_denied" ? "Connection cancelled." : error);
  if (!code) return fail("Google did not return an authorization code.");
  if (!state || !expectedState || state !== expectedState) {
    return fail("Could not verify the request — please try connecting again.");
  }

  try {
    await connectGoogleDriveAccount(code, user.id);
  } catch (err) {
    console.error("Google Drive connect failed:", err);
    const message = err instanceof Error ? err.message : "Connection failed.";
    return fail(message);
  }

  const res = NextResponse.redirect(new URL("/admin/storage?connected=1", req.url));
  res.cookies.delete("gdrive_oauth_state");
  return res;
}
