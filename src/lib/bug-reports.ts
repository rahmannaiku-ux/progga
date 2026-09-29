import type { BugReportStatus } from "@prisma/client";

/** Screenshots allowed per report. Each one is its own BUG_REPORT Upload (≤10 MB, see lib/storage/limits.ts). */
export const MAX_BUG_REPORT_IMAGES = 5;

export const BUG_REPORT_STATUSES: BugReportStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export const BUG_REPORT_STATUS_META: Record<BugReportStatus, { label: string; className: string }> = {
  OPEN: { label: "Open", className: "bg-danger text-danger-foreground" },
  IN_PROGRESS: { label: "In progress", className: "bg-xp text-xp-foreground" },
  RESOLVED: { label: "Resolved", className: "bg-primary text-primary-foreground" },
  CLOSED: { label: "Closed", className: "bg-muted text-muted-foreground" },
};
