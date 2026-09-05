/** Configurable quota warning thresholds (storage spec §16). */
export const QUOTA_WARNING_THRESHOLDS = {
  WARNING: 0.7, // "Storage usage is getting high."
  HIGH: 0.85, // "Google Drive storage is nearly full."
  CRITICAL: 0.95, // "Critical: Google Drive storage is almost full."
} as const;

export function getQuotaWarning(usageBytes: number, limitBytes: number | null) {
  if (!limitBytes || limitBytes <= 0) return null;
  const ratio = usageBytes / limitBytes;
  if (ratio >= QUOTA_WARNING_THRESHOLDS.CRITICAL) {
    return { level: "critical" as const, message: "Critical: Google Drive storage is almost full." };
  }
  if (ratio >= QUOTA_WARNING_THRESHOLDS.HIGH) {
    return { level: "high" as const, message: "Google Drive storage is nearly full." };
  }
  if (ratio >= QUOTA_WARNING_THRESHOLDS.WARNING) {
    return { level: "warning" as const, message: "Storage usage is getting high." };
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
