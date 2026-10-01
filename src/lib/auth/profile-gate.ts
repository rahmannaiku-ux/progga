/**
 * True when a signed-in student still has to finish their profile: either the
 * first-login form is not done, or (for students who finished it before email
 * became required) they have no email on file yet. Students only; teachers and
 * admins never go through the student profile flow.
 */
export function studentNeedsProfileStep(user: {
  role: string;
  profileCompleted: boolean;
  email: string | null;
}): boolean {
  return user.role === "STUDENT" && (!user.profileCompleted || !user.email);
}
