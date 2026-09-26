import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth/safe-redirect";

/**
 * PHASE 5: Clerk's sign-in widget is retired. This route is kept only
 * as a redirect target for old links/bookmarks — safeReturnTo (the
 * same open-redirect guard the new /login page itself uses) translates
 * a legacy Clerk-style `redirect_url` param into the new `returnTo`
 * convention, rather than trusting it directly.
 */
export default function SignInRedirectPage({
  searchParams,
}: {
  searchParams: { redirect_url?: string };
}) {
  const returnTo = safeReturnTo(searchParams.redirect_url);
  redirect(returnTo === "/dashboard" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`);
}
