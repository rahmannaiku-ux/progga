import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { updateSiteSettings } from "@/server/actions/admin-settings-actions";

export default async function AdminBrandingPage() {
  await requireRole("ADMIN");

  const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Site branding
      </h1>

      <form action={updateSiteSettings} className="glass-panel mt-6 space-y-4 p-6">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Site name
          </label>
          <input
            name="siteName"
            defaultValue={settings?.siteName ?? "Proggaa"}
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Logo URL
          </label>
          <input
            name="logoUrl"
            defaultValue={settings?.logoUrl ?? ""}
            placeholder="https://..."
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Favicon URL
          </label>
          <input
            name="faviconUrl"
            defaultValue={settings?.faviconUrl ?? ""}
            placeholder="https://..."
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Primary color
          </label>
          <input
            type="color"
            name="primaryColor"
            defaultValue={settings?.primaryColor ?? "#7C3AED"}
            className="h-10 w-20 rounded-lg border border-border/60 bg-surface"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Support email
          </label>
          <input
            type="email"
            name="supportEmail"
            defaultValue={settings?.supportEmail ?? ""}
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="maintenanceMode"
            defaultChecked={settings?.maintenanceMode ?? false}
          />
          Maintenance mode
        </label>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Maintenance message (optional)
          </label>
          <textarea
            name="maintenanceMessage"
            defaultValue={settings?.maintenanceMessage ?? ""}
            placeholder="We're doing some quick upgrades — back shortly!"
            rows={2}
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Estimated restoration (optional)
          </label>
          <input
            name="maintenanceEstimatedRestore"
            defaultValue={settings?.maintenanceEstimatedRestore ?? ""}
            placeholder="Back by 6pm UTC"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Maintenance mode is actively enforced — students, mentors, and public visitors are
          shown the maintenance page immediately; admins can still sign in and use the app.
        </p>
        <button
          type="submit"
          className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground"
        >
          Save branding
        </button>
      </form>
    </div>
  );
}
