/**
 * Thrown by startAttempt (attempt-actions.ts) in place of next/navigation's
 * redirect(). Calling redirect() inside a Server Action triggers a known
 * Next.js 14 bug ("failed to forward action response" / TypeError: fetch
 * failed) — same class of crash requireActiveUser already works around for
 * the auth check (see the comment there). startAttempt has three legitimate
 * navigation points (resume in-progress, P2002 race loser, normal success)
 * that aren't auth-related but hit the same fragile redirect-forwarding
 * path, so they get the same treatment: throw this and let the client
 * navigate itself with router.push().
 *
 * Deliberately its own file, NOT inside attempt-actions.ts: that file has
 * "use server" at the top, and Next.js only permits async function exports
 * from a "use server" module — exporting a class from it fails the build.
 * This file has no directive, so both the server action and the client
 * component that catches it can import it safely.
 */
export class AttemptRedirectSignal extends Error {
  constructor(public readonly path: string) {
    super(`AttemptRedirectSignal:${path}`);
    this.name = "AttemptRedirectSignal";
  }
}
