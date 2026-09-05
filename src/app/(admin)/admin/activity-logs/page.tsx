import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";

const CONFIG_ENTITY_TYPES = new Set(["PlatformSetting", "FeatureFlag", "Destination"]);

function formatChange(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function ActivityLogsPage() {
  await requireRole("ADMIN");

  const logs = await db.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-foreground">
        Activity logs
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Most recent 100 audited actions across the platform — including every Control Center
        setting, feature flag, and destination change. Secrets/API keys are never written here.
      </p>

      {/* Mobile: cards, one per log entry. */}
      <div className="glass-panel mt-6 md:hidden">
        {logs.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {logs.map((log) => {
              const metadata = log.metadata as { oldValue?: unknown; newValue?: unknown } | null;
              const isConfigChange = CONFIG_ENTITY_TYPES.has(log.entityType) || log.action === "SETTINGS_CHANGE";
              return (
                <li key={log.id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {log.user.firstName} {log.user.lastName}
                    </p>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {log.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{log.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.action.toLowerCase().replace("_", " ")}
                    {" · "}
                    {log.entityType}
                    {log.entityId && (
                      <span className="ml-1 font-mono text-[11px]">
                        {CONFIG_ENTITY_TYPES.has(log.entityType) ? log.entityId : `#${log.entityId.slice(0, 8)}`}
                      </span>
                    )}
                  </p>
                  {isConfigChange && metadata && (metadata.oldValue !== undefined || metadata.newValue !== undefined) && (
                    <p className="break-words font-mono text-[11px] text-muted-foreground">
                      {formatChange(metadata.oldValue)} → {formatChange(metadata.newValue)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop: unchanged table, scoped to md and up. */}
      <div className="glass-panel mt-6 hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="p-4 font-medium">When</th>
              <th className="p-4 font-medium">Who</th>
              <th className="p-4 font-medium">Action</th>
              <th className="p-4 font-medium">Entity</th>
              <th className="p-4 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const metadata = log.metadata as { oldValue?: unknown; newValue?: unknown } | null;
              const isConfigChange = CONFIG_ENTITY_TYPES.has(log.entityType) || log.action === "SETTINGS_CHANGE";
              return (
                <tr key={log.id} className="border-b border-border/40 last:border-0">
                  <td className="p-4 text-muted-foreground">
                    {log.createdAt.toLocaleString()}
                  </td>
                  <td className="p-4 text-foreground">
                    {log.user.firstName} {log.user.lastName}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({log.user.email})
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {log.action.toLowerCase().replace("_", " ")}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {log.entityType}
                    {log.entityId && (
                      <span className="ml-1 font-mono text-[11px]">
                        {CONFIG_ENTITY_TYPES.has(log.entityType) ? log.entityId : `#${log.entityId.slice(0, 8)}`}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {isConfigChange && metadata && (metadata.oldValue !== undefined || metadata.newValue !== undefined) ? (
                      <span className="font-mono text-[11px]">
                        {formatChange(metadata.oldValue)} → {formatChange(metadata.newValue)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  No activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
