import { redirect } from "next/navigation";

/**
 * PHASE 5: Clerk's sign-up widget is retired. Kept only as a redirect
 * target for old links/bookmarks — the real registration feature-flag
 * check now lives at /register itself (and is enforced server-side in
 * the registration action regardless), so there's nothing else for
 * this page to do.
 */
export default function SignUpRedirectPage() {
  redirect("/register");
}
