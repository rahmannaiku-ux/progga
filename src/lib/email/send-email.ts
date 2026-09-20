import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { escapeHtml } from "@/lib/sanitize-html";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Every caller passes plain values (titles, names, numbers) that were
// never meant to contain HTML — course titles are teacher-authored,
// names come from Clerk signup, both lower-trust than this template
// system's own admin-authored markup. Escaping here, once, at the
// interpolation boundary, closes the injection vector for every current
// and future call site without each caller needing to remember to do it.
function interpolate(template: string, vars: Record<string, string | number>, escape: boolean) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) return `{{${key}}}`;
    const value = String(vars[key]);
    return escape ? escapeHtml(value) : value;
  });
}

/**
 * Sends an email using the admin-editable template stored under `key`
 * (see Admin → Email Templates). Falls back to a bare-bones inline
 * template if no row exists yet, so the app still sends something
 * useful before an admin has customized it.
 */
export async function sendTemplatedEmail(
  key: string,
  to: string,
  vars: Record<string, string | number>,
  fallback: { subject: string; bodyHtml: string }
) {
  const template = await db.emailTemplate.findUnique({ where: { key } });
  const subject = interpolate(template?.subject ?? fallback.subject, vars, false);
  const bodyHtml = interpolate(template?.bodyHtml ?? fallback.bodyHtml, vars, true);

  if (!resend) {
    console.warn(`[email:skipped, no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return { sent: false as const };
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Proggaa <no-reply@proggaa.example>",
      to,
      subject,
      html: bodyHtml,
    });
    return { sent: true as const };
  } catch (err) {
    // Email is never allowed to break the calling flow (enrollment,
    // grading, certificate issuance) — log and move on.
    console.error(`Failed to send email (key=${key}, to=${to}):`, err);
    return { sent: false as const };
  }
}
