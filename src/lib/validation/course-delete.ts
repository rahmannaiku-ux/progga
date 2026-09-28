/**
 * The exact phrase an admin must type to delete a mission — checked in
 * the dialog (to enable the button) AND again in the server action, so
 * the confirmation can't be skipped by calling the action directly.
 */
export function courseDeleteConfirmationPhrase(courseTitle: string): string {
  return `confirm delete ${courseTitle.trim().replace(/\s+/g, " ")}`;
}

/** Case-sensitive; only surrounding/repeated whitespace is forgiven. */
export function isCourseDeleteConfirmed(typed: string, courseTitle: string): boolean {
  return typed.trim().replace(/\s+/g, " ") === courseDeleteConfirmationPhrase(courseTitle);
}
