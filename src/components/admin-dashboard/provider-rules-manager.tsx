"use client";

import { useState, useTransition } from "react";
import { Upload, Power, ChevronDown, ChevronRight } from "lucide-react";
import { publishProviderConfiguration, setProviderConfigurationEnabled } from "@/server/actions/payment-device-actions";
import { formatDhakaDateTime } from "@/lib/timezone";

type Version = {
  provider: string;
  version: number;
  enabled: boolean;
  effectiveAt: Date;
  rulesHash: string;
  createdAt: Date;
};

const PLACEHOLDER = `{
  "schemaVersion": 1,
  "providerKeywords": [],
  "senderRules": [
    { "pattern": "EXACT-SENDER-ID-FROM-A-REAL-MESSAGE", "senderType": "ALPHANUMERIC", "enabled": true }
  ],
  "parserRules": [
    {
      "name": "received-v1",
      "requiredPhrases": ["you have received"],
      "forbiddenPhrases": ["otp", "pin"],
      "transactionIdPattern": "TrxID\\\\s+([A-Z0-9]+)",
      "transactionIdFormat": "[A-Z0-9]{8,12}",
      "amountPattern": "Tk\\\\s*([\\\\d,]+(?:\\\\.\\\\d{1,2})?)",
      "senderNumberPattern": "from\\\\s+(\\\\+?\\\\d{11,15})",
      "requireReceiver": false,
      "enabled": true
    }
  ],
  "maxTransactionAgeMinutes": 1440
}`;

/**
 * Publishing NEVER edits a version in place — every save is a new, immutable version, so a past
 * decision stays auditable against the exact rules that produced it. A version is inert until you
 * enable it. Sender IDs and message wording must come from real messages received on the provider's
 * own phone — never guessed (see docs/payment-automation.md §7).
 */
export function ProviderRulesManager({ providers, versionsByProvider }: { providers: readonly string[]; versionsByProvider: Record<string, Version[]> }) {
  const [isPending, startTransition] = useTransition();
  const [openProvider, setOpenProvider] = useState<string | null>(providers[0] ?? null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [enableOnPublish, setEnableOnPublish] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string | null>>({});
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {providers.map((p) => {
        const versions = versionsByProvider[p] ?? [];
        const isOpen = openProvider === p;
        return (
          <div key={p} className="comic-panel bg-surface p-5">
            <button type="button" onClick={() => setOpenProvider(isOpen ? null : p)} className="flex min-h-11 w-full items-center justify-between text-left">
              <span className="font-display font-bold text-foreground">{p}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {versions.some((v) => v.enabled) ? (
                  <span className="sticker-badge bg-accent/20 px-2 py-0.5 font-bold text-accent">
                    v{versions.find((v) => v.enabled)!.version} enabled
                  </span>
                ) : (
                  <span className="sticker-badge bg-danger/10 px-2 py-0.5 font-bold text-danger">no enabled version</span>
                )}
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </button>

            {isOpen && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No versions published yet.</p>
                  ) : (
                    versions.map((v) => {
                      const key = `${p}:${v.version}`;
                      return (
                        <div key={key} className="rounded-lg bg-muted px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button type="button" onClick={() => setExpandedVersion(expandedVersion === key ? null : key)} className="font-semibold text-foreground hover:underline">
                              v{v.version} · {v.enabled ? "enabled" : "disabled"} · published {formatDhakaDateTime(v.createdAt)}
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => startTransition(() => setProviderConfigurationEnabled(p, v.version, !v.enabled))}
                              className={`flex min-h-11 items-center gap-1 py-2 font-semibold hover:underline disabled:opacity-50 ${v.enabled ? "text-danger" : "text-accent"}`}
                            >
                              <Power className="h-3 w-3" /> {v.enabled ? "Disable" : "Enable"}
                            </button>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">hash {v.rulesHash.slice(0, 16)}…</p>
                          {expandedVersion === key && (
                            <p className="mt-1 text-muted-foreground">
                              Devices that already downloaded this version keep using it until they next sync. Disabling it stops NEW devices from
                              adopting it, and devices on it will fall back to whatever version is enabled at their next config check.
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError((s) => ({ ...s, [p]: null }));
                    const rulesJson = draft[p] ?? "";
                    startTransition(async () => {
                      try {
                        const r = await publishProviderConfiguration(p, rulesJson, enableOnPublish[p] ?? false);
                        setDraft((s) => ({ ...s, [p]: "" }));
                        setOpenProvider(p);
                        alert(`Published ${r.provider} v${r.version}.`); // eslint-disable-line no-alert -- immediate, one-off confirmation; no toast system wired in here yet
                      } catch (err) {
                        setError((s) => ({ ...s, [p]: err instanceof Error ? err.message : "Something went wrong." }));
                      }
                    });
                  }}
                >
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Publish a new version (JSON — sender rules, parser rules; see structure below)
                  </label>
                  <textarea
                    value={draft[p] ?? ""}
                    onChange={(e) => setDraft((s) => ({ ...s, [p]: e.target.value }))}
                    placeholder={PLACEHOLDER}
                    rows={12}
                    spellCheck={false}
                    className="w-full bg-surface px-3 py-2.5 font-mono text-xs text-foreground"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                    <input type="checkbox" checked={enableOnPublish[p] ?? false} onChange={(e) => setEnableOnPublish((s) => ({ ...s, [p]: e.target.checked }))} className="h-4 w-4" />
                    Enable immediately (devices will start using it on their next config check)
                  </label>
                  {error[p] && <p className="mt-2 whitespace-pre-wrap text-xs font-medium text-danger">{error[p]}</p>}
                  <button type="submit" disabled={isPending} className="comic-btn mt-3 flex min-h-11 items-center gap-1.5 bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                    <Upload className="h-3.5 w-3.5" /> Publish new version
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
