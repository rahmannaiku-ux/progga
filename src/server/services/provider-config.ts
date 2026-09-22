import { db } from "@/lib/db/client";
import { MFS_PROVIDERS, type MfsProvider } from "@/lib/payments/sms/types";
import { providerRulesSchema, hashRules, type ProviderRules } from "@/lib/payments/sms/rules";
import type { ConfigInfo } from "@/lib/payments/sms/risk";

export interface EffectiveConfig {
  provider: MfsProvider;
  version: number;
  enabled: boolean;
  effectiveAt: string;
  rules: ProviderRules;
  rulesHash: string;
}

/** Newest enabled, already-effective configuration per provider — what devices download. */
export async function getEffectiveConfigurations(now = new Date()): Promise<EffectiveConfig[]> {
  const rows = await db.providerConfiguration.findMany({
    where: { enabled: true, effectiveAt: { lte: now } },
    orderBy: [{ provider: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  const out: EffectiveConfig[] = [];
  for (const r of rows) {
    if (seen.has(r.provider)) continue;
    const parsed = providerRulesSchema.safeParse(r.rules);
    if (!parsed.success) continue; // never serve a config that fails validation
    // Integrity check: refuse to serve rules whose stored hash doesn't match their (normalized) content.
    // Publishing stores parsed.data and hashRules(parsed.data), so these must agree.
    if (hashRules(parsed.data) !== r.rulesHash) continue;
    seen.add(r.provider);
    out.push({
      provider: r.provider as MfsProvider,
      version: r.version,
      enabled: r.enabled,
      effectiveAt: r.effectiveAt.toISOString(),
      rules: parsed.data,
      rulesHash: r.rulesHash,
    });
  }
  return out;
}

/** Server-side view of the exact (provider, version) a device claims to have parsed with. */
export async function loadConfigInfo(provider: MfsProvider, version: number, now = new Date()): Promise<ConfigInfo | null> {
  const [row, latest] = await Promise.all([
    db.providerConfiguration.findUnique({ where: { provider_version: { provider, version } } }),
    db.providerConfiguration.findFirst({
      where: { provider, enabled: true, effectiveAt: { lte: now } },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);
  if (!row) return null;
  const parsed = providerRulesSchema.safeParse(row.rules);
  if (!parsed.success) return null; // invalid stored config == unknown config == hard failure
  return {
    version: row.version,
    enabled: row.enabled,
    isLatest: latest?.version === row.version,
    transactionIdFormats: parsed.data.parserRules.filter((p) => p.enabled !== false).map((p) => p.transactionIdFormat),
    maxTransactionAgeMinutes: parsed.data.maxTransactionAgeMinutes,
  };
}

export { MFS_PROVIDERS };
