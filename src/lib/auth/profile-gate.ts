/**
 * True when a signed-in student still has to finish their profile: either the
 * first-login form is not done, or (for students who finished it before email
 * became required) they have no email on file yet, or they haven't confirmed their
 * college and district against the official lists. Students only; teachers and
 * admins never go through the student profile flow.
 */
export function studentNeedsProfileStep(user: {
  role: string;
  profileCompleted: boolean;
  email: string | null;
  schoolVerifiedAt?: Date | null;
}): boolean {
  return user.role === "STUDENT" && (!user.profileCompleted || !user.email || !user.schoolVerifiedAt);
}
