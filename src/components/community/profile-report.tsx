"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ReportForm } from "./bits";

export function ProfileReport({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <ReportForm targetType="PROFILE" targetId={userId} onDone={() => setOpen(false)} />;
  return (
    <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-danger">
      <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report this profile
    </button>
  );
}
