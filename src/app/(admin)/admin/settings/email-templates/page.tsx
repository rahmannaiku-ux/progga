import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { upsertEmailTemplate } from "@/server/actions/admin-settings-actions";

const KNOWN_TEMPLATES = [
  { key: "welcome", label: "Welcome email" },
  { key: "certificate-issued", label: "Certificate issued" },
  { key: "grade-posted", label: "Grade posted" },
  { key: "enrollment-confirmed", label: "Enrollment confirmed" },
];

export default async function EmailTemplatesPage() {
  await requireRole("ADMIN");

  const templates = await db.emailTemplate.findMany();
  const byKey = new Map(templates.map((t) => [t.key, t]));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Email templates
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Editing a template here doesn't send anything by itself — Resend
        wiring reads these rows when a triggering event fires.
      </p>

      <div className="mt-6 space-y-4">
        {KNOWN_TEMPLATES.map((t) => {
          const existing = byKey.get(t.key);
          return (
            <details key={t.key} className="glass-panel p-5">
              <summary className="cursor-pointer list-none font-display text-sm font-bold text-foreground">
                {t.label}{" "}
                <span className="font-mono text-xs text-muted-foreground">({t.key})</span>
              </summary>
              <form action={upsertEmailTemplate} className="mt-4 space-y-3">
                <input type="hidden" name="key" value={t.key} />
                <input
                  name="subject"
                  defaultValue={existing?.subject ?? ""}
                  required
                  placeholder="Email subject"
                  className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
                />
                <textarea
                  name="bodyHtml"
                  defaultValue={existing?.bodyHtml ?? ""}
                  rows={6}
                  placeholder="<p>HTML body, supports {{variables}}</p>"
                  className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 font-mono text-xs text-foreground"
                />
                <button
                  type="submit"
                  className="comic-btn h-10 bg-primary px-4 text-xs font-bold text-primary-foreground"
                >
                  Save template
                </button>
              </form>
            </details>
          );
        })}
      </div>
    </div>
  );
}
