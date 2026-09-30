"use client";

import { RouteError } from "@/components/shared/route-error";

export default function MentorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/mentor/dashboard" homeLabel="Back to dashboard" />;
}
