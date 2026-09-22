import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { ProviderRulesManager } from "@/components/admin-dashboard/provider-rules-manager";
import { MFS_PROVIDERS } from "@/lib/payments/sms/types";

export default async function AdminProviderRulesPage() {
  await requireRole("ADMIN");

  const rows = await db.providerConfiguration.findMany({
    orderBy: [{ provider: "asc" }, { version: "desc" }],
    select: { provider: true, version: true, enabled: true, effectiveAt: true, rulesHash: true, createdAt: true },
  });
  const versionsByProvider: Record<string, typeof rows> = {};
  for (const r of rows) (versionsByProvider[r.provider] ??= []).push(r);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">🧾 Provider Rules</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Versioned sender/parser rules the Android app downloads and uses to recognize payment SMS. A version is
        immutable once published and inert until enabled — publishing never edits a past version, so old decisions
        stay auditable against the exact rules that produced them.
      </p>
      <div className="comic-panel mt-4 !bg-xp/10 p-4 text-xs text-foreground/80">
        ⚠️ Sender IDs and message wording must come from real messages received on that provider's own phone.
        Never guess or invent them.
      </div>
      <div className="mt-6">
        <ProviderRulesManager providers={MFS_PROVIDERS} versionsByProvider={versionsByProvider} />
      </div>
    </div>
  );
}
