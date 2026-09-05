import { Badge } from "@/components/ui/badge";
import type { CourseStatus } from "@prisma/client";

const config: Record<CourseStatus, { label: string; variant: "default" | "accent" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PUBLISHED: { label: "Published", variant: "accent" },
  ARCHIVED: { label: "Archived", variant: "default" },
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
