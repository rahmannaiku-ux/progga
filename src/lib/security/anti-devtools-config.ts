import { isFeatureEnabled } from "@/lib/config/feature-flags";

/**
 * Server-side decision: should the anti-DevTools monitor run for this user?
 * The result is passed to the client as a plain boolean prop.
 *
 *  - ANTI_DEVTOOLS=on|off  overrides everything (default: ON in production,
 *    OFF in `next dev` — otherwise developers get redirected by their own
 *    DevTools).
 *  - The admin feature flag "devtools_protection" (Control Center →
 *    Feature flags) is an instant kill-switch if it ever misfires.
 *  - ANTI_DEVTOOLS_ROLES is a comma list of roles it applies to
 *    (default: STUDENT). Teachers and admins keep normal DevTools access.
 */
export async function isAntiDevToolsEnabledFor(user: { id: string; role: string }): Promise<boolean> {
  const mode = (process.env.ANTI_DEVTOOLS ?? "").toLowerCase();
  if (mode === "off") return false;
  if (mode !== "on" && process.env.NODE_ENV !== "production") return false;

  const roles = (process.env.ANTI_DEVTOOLS_ROLES ?? "STUDENT")
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);
  if (!roles.includes(user.role.toUpperCase())) return false;

  try {
    return await isFeatureEnabled("devtools_protection", { userId: user.id, role: user.role });
  } catch {
    // If the flag store is unreadable, fall back to its default (on).
    return true;
  }
}
