"use client";

import { RouteError } from "@/components/shared/route-error";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/admin/dashboard" homeLabel="Back to dashboard" />;
}
