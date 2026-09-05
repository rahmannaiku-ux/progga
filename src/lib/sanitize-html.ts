import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizes admin-authored HTML (blog posts, email template previews)
 * before rendering. Currently only admins can author this content, so
 * this isn't defending against an active attacker today — but it's
 * cheap insurance against the day a lower-trust role gets write access,
 * a dependency gets compromised, or someone just makes a typo pasting
 * from a rich-text source.
 */
export function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "img",
      "table", "thead", "tbody", "tr", "th", "td", "hr", "span",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
  });
}

/**
 * Escapes plain user-supplied text (names, emails, free-text messages)
 * before interpolating it into an HTML email or any other HTML context.
 * Unlike sanitizeHtml above, this assumes the input is NOT meant to
 * contain any HTML at all — every special character is escaped, not
 * filtered through an allowlist. Use this for values like a contact
 * form's name/email/message; use sanitizeHtml for admin-authored rich
 * content that's actually supposed to contain tags.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
