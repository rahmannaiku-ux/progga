"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
    >
      <Printer className="h-3.5 w-3.5" /> Print / Save PDF
    </button>
  );
}
