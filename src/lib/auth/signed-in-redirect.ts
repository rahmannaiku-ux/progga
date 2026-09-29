import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";

/** Role-appropriate landing page ("Command Center"). */
export function dashboardHrefForRole(role: string) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "TEACHER") return "/mentor/dashboard";
  return "/dashboard";
}

/**
 * For /login and /register: a visitor who is already signed in goes
 * straight to where they were headed instead of being asked to sign in
 * again. Re-submitting the login form while already signed in used to
 * be what surfaced the "active on another device" prompt for students
 * who had only ever used one device.
 */
export async function redirectIfSignedIn(returnTo?: string) {
  const user = await getCurrentSessionUser();
  if (!user || !user.isActive || user.isSuspended) return;
  if (user.role === "STUDENT" && !user.profileCompleted) redirect("/complete-profile");
  redirect(returnTo ?? dashboardHrefForRole(user.role));
}
